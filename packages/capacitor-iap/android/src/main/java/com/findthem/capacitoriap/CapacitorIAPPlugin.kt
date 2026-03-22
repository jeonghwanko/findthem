package com.findthem.capacitoriap

import android.app.Activity
import com.android.billingclient.api.*
import com.getcapacitor.*
import com.getcapacitor.annotation.CapacitorPlugin

@CapacitorPlugin(name = "CapacitorIAP")
class CapacitorIAPPlugin : Plugin() {

    private lateinit var billingClient: BillingClient

    /**
     * 현재 진행 중인 구매 call.
     * launchBillingFlow()는 비동기이므로 PurchasesUpdatedListener에서 처리.
     */
    private var pendingPurchaseCall: PluginCall? = null

    // ── 초기화 ────────────────────────────────────────────────

    override fun load() {
        billingClient = BillingClient.newBuilder(context)
            .setListener { billingResult, purchases ->
                handlePurchaseUpdate(billingResult, purchases)
            }
            .enablePendingPurchases(
                PendingPurchasesParams.newBuilder()
                    .enableOneTimeProducts()
                    .build()
            )
            .build()
    }

    // ── 구매 완료 콜백 ────────────────────────────────────────

    private fun handlePurchaseUpdate(
        billingResult: BillingResult,
        purchases: List<Purchase>?,
    ) {
        val call = pendingPurchaseCall ?: return
        pendingPurchaseCall = null

        when (billingResult.responseCode) {
            BillingClient.BillingResponseCode.OK -> {
                val purchase = purchases?.firstOrNull()
                if (purchase == null) {
                    call.reject("PURCHASE_FAILED", "No purchase returned")
                    return
                }
                acknowledgePurchase(call, purchase)
            }
            BillingClient.BillingResponseCode.USER_CANCELED -> {
                call.reject("USER_CANCELLED", "Purchase cancelled by user")
            }
            BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED -> {
                // 이미 보유 중 — transactionId 없이 에러로 처리
                call.reject("ITEM_ALREADY_OWNED", "Product already owned. Use restorePurchases.")
            }
            else -> {
                call.reject(
                    "PURCHASE_FAILED",
                    "Billing error: ${billingResult.debugMessage} (code ${billingResult.responseCode})",
                )
            }
        }
    }

    /**
     * 구매 확인(acknowledge) — 미확인 구매는 3일 후 자동 환불됨.
     * 확인 완료 후 purchaseToken + orderId를 JS로 반환.
     */
    private fun acknowledgePurchase(call: PluginCall, purchase: Purchase) {
        if (purchase.isAcknowledged) {
            // 이미 확인됨 (복원 구매 등)
            resolveWithPurchase(call, purchase)
            return
        }

        val ackParams = AcknowledgePurchaseParams.newBuilder()
            .setPurchaseToken(purchase.purchaseToken)
            .build()

        billingClient.acknowledgePurchase(ackParams) { ackResult ->
            if (ackResult.responseCode == BillingClient.BillingResponseCode.OK) {
                resolveWithPurchase(call, purchase)
            } else {
                call.reject(
                    "ACKNOWLEDGE_FAILED",
                    "Failed to acknowledge: ${ackResult.debugMessage}",
                )
            }
        }
    }

    private fun resolveWithPurchase(call: PluginCall, purchase: Purchase) {
        call.resolve(
            JSObject().apply {
                put("transactionId", purchase.orderId ?: purchase.purchaseToken)
                put("productId", purchase.products.firstOrNull() ?: "")
                put("platform", "android")
                put("purchaseToken", purchase.purchaseToken)
            }
        )
    }

    // ── BillingClient 연결 헬퍼 ────────────────────────────────

    private fun ensureConnected(callback: (Boolean) -> Unit) {
        if (billingClient.isReady) {
            callback(true)
            return
        }
        billingClient.startConnection(object : BillingClientStateListener {
            override fun onBillingSetupFinished(result: BillingResult) {
                callback(result.responseCode == BillingClient.BillingResponseCode.OK)
            }
            override fun onBillingServiceDisconnected() {
                callback(false)
            }
        })
    }

    // ── getProducts ───────────────────────────────────────────

    @PluginMethod
    fun getProducts(call: PluginCall) {
        val rawIds = call.getArray("productIds")?.toList<String>()
        if (rawIds.isNullOrEmpty()) {
            call.reject("INVALID_ARGUMENTS", "productIds must be a non-empty array")
            return
        }

        ensureConnected { connected ->
            if (!connected) {
                call.reject("BILLING_UNAVAILABLE", "Could not connect to Google Play")
                return@ensureConnected
            }

            val productList = rawIds.map { id ->
                QueryProductDetailsParams.Product.newBuilder()
                    .setProductId(id)
                    .setProductType(BillingClient.ProductType.INAPP)
                    .build()
            }

            val params = QueryProductDetailsParams.newBuilder()
                .setProductList(productList)
                .build()

            billingClient.queryProductDetailsAsync(params) { result, details ->
                if (result.responseCode != BillingClient.BillingResponseCode.OK) {
                    call.reject("FETCH_FAILED", result.debugMessage)
                    return@queryProductDetailsAsync
                }

                val products = JSArray()
                details.forEach { detail ->
                    val offer = detail.oneTimePurchaseOfferDetails
                    products.put(
                        JSObject().apply {
                            put("id", detail.productId)
                            put("title", detail.title)
                            put("description", detail.description)
                            put("price", offer?.priceAmountMicros?.div(1_000_000.0) ?: 0.0)
                            put("localizedPrice", offer?.formattedPrice ?: "")
                            put("currencyCode", offer?.priceCurrencyCode ?: "")
                        }
                    )
                }

                call.resolve(JSObject().apply { put("products", products) })
            }
        }
    }

    // ── purchase ──────────────────────────────────────────────

    @PluginMethod
    fun purchase(call: PluginCall) {
        val productId = call.getString("productId")
        if (productId.isNullOrBlank()) {
            call.reject("INVALID_ARGUMENTS", "productId is required")
            return
        }

        ensureConnected { connected ->
            if (!connected) {
                call.reject("BILLING_UNAVAILABLE", "Could not connect to Google Play")
                return@ensureConnected
            }

            val productList = listOf(
                QueryProductDetailsParams.Product.newBuilder()
                    .setProductId(productId)
                    .setProductType(BillingClient.ProductType.INAPP)
                    .build()
            )

            val params = QueryProductDetailsParams.newBuilder()
                .setProductList(productList)
                .build()

            billingClient.queryProductDetailsAsync(params) { result, details ->
                val detail = details.firstOrNull()
                if (result.responseCode != BillingClient.BillingResponseCode.OK || detail == null) {
                    call.reject("PRODUCT_NOT_FOUND", "Product '$productId' not found on Google Play")
                    return@queryProductDetailsAsync
                }

                val productDetailsParams = BillingFlowParams.ProductDetailsParams.newBuilder()
                    .setProductDetails(detail)
                    .build()

                val billingFlowParams = BillingFlowParams.newBuilder()
                    .setProductDetailsParamsList(listOf(productDetailsParams))
                    .build()

                // call은 handlePurchaseUpdate에서 resolve/reject
                pendingPurchaseCall = call

                val currentActivity = activity as? Activity
                if (currentActivity == null) {
                    pendingPurchaseCall = null
                    call.reject("ACTIVITY_UNAVAILABLE", "Cannot launch billing flow without an Activity")
                    return@queryProductDetailsAsync
                }

                val flowResult = billingClient.launchBillingFlow(currentActivity, billingFlowParams)
                if (flowResult.responseCode != BillingClient.BillingResponseCode.OK) {
                    pendingPurchaseCall = null
                    call.reject("BILLING_FLOW_FAILED", flowResult.debugMessage)
                }
            }
        }
    }

    // ── restorePurchases ──────────────────────────────────────

    @PluginMethod
    fun restorePurchases(call: PluginCall) {
        ensureConnected { connected ->
            if (!connected) {
                call.reject("BILLING_UNAVAILABLE", "Could not connect to Google Play")
                return@ensureConnected
            }

            val params = QueryPurchasesParams.newBuilder()
                .setProductType(BillingClient.ProductType.INAPP)
                .build()

            billingClient.queryPurchasesAsync(params) { result, purchases ->
                if (result.responseCode != BillingClient.BillingResponseCode.OK) {
                    call.reject("RESTORE_FAILED", result.debugMessage)
                    return@queryPurchasesAsync
                }

                val list = JSArray()
                purchases
                    .filter { it.purchaseState == Purchase.PurchaseState.PURCHASED }
                    .forEach { purchase ->
                        list.put(
                            JSObject().apply {
                                put("transactionId", purchase.orderId ?: purchase.purchaseToken)
                                put("productId", purchase.products.firstOrNull() ?: "")
                                put("platform", "android")
                                put("purchaseToken", purchase.purchaseToken)
                            }
                        )
                    }

                call.resolve(JSObject().apply { put("purchases", list) })
            }
        }
    }

    // ── 생명주기 ──────────────────────────────────────────────

    override fun handleOnDestroy() {
        if (billingClient.isReady) {
            billingClient.endConnection()
        }
        super.handleOnDestroy()
    }
}
