import Capacitor
import StoreKit

@objc(CapacitorIAPPlugin)
public class CapacitorIAPPlugin: CAPPlugin, CAPBridgedPlugin {

    public let identifier   = "CapacitorIAPPlugin"
    public let jsName       = "CapacitorIAP"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getProducts",     returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "purchase",        returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "restorePurchases", returnType: CAPPluginReturnPromise),
    ]

    // MARK: - getProducts

    @objc func getProducts(_ call: CAPPluginCall) {
        guard let rawIds = call.getArray("productIds"),
              let productIds = rawIds as? [String],
              !productIds.isEmpty else {
            call.reject("INVALID_ARGUMENTS", "productIds must be a non-empty string array")
            return
        }

        Task {
            do {
                let products = try await Product.products(for: Set(productIds))
                let list: [[String: Any]] = products.map { p in
                    let formatter = NumberFormatter()
                    formatter.numberStyle    = .currency
                    formatter.locale         = p.priceFormatStyle.locale
                    formatter.currencyCode   = p.priceFormatStyle.currencyCode ?? "USD"

                    return [
                        "id":             p.id,
                        "title":          p.displayName,
                        "description":    p.description,
                        "price":          NSDecimalNumber(decimal: p.price).doubleValue,
                        "localizedPrice": p.displayPrice,
                        "currencyCode":   p.priceFormatStyle.currencyCode ?? "USD",
                    ]
                }
                call.resolve(["products": list])
            } catch {
                call.reject("FETCH_FAILED", error.localizedDescription)
            }
        }
    }

    // MARK: - purchase

    @objc func purchase(_ call: CAPPluginCall) {
        guard let productId = call.getString("productId") else {
            call.reject("INVALID_ARGUMENTS", "productId is required")
            return
        }

        Task {
            do {
                let products = try await Product.products(for: [productId])
                guard let product = products.first else {
                    call.reject("PRODUCT_NOT_FOUND", "Product '\(productId)' not found on App Store")
                    return
                }

                let result = try await product.purchase()

                switch result {
                case .success(let verification):
                    switch verification {
                    case .verified(let transaction):
                        // 반드시 finish() 호출 — 미호출 시 App Store가 영수증 재발송
                        await transaction.finish()
                        call.resolve([
                            "transactionId": String(transaction.id),
                            "productId":     transaction.productID,
                            "platform":      "ios",
                        ])
                    case .unverified(_, let verificationError):
                        call.reject("PURCHASE_UNVERIFIED", verificationError.localizedDescription)
                    }

                case .userCancelled:
                    call.reject("USER_CANCELLED", "Purchase cancelled by user")

                case .pending:
                    // 결제 대기 중 (보호자 승인 필요 등) — 취소 아님
                    call.reject("PURCHASE_PENDING", "Purchase is pending approval")

                @unknown default:
                    call.reject("UNKNOWN_ERROR", "Unknown purchase result")
                }
            } catch {
                call.reject("PURCHASE_FAILED", error.localizedDescription)
            }
        }
    }

    // MARK: - restorePurchases

    @objc func restorePurchases(_ call: CAPPluginCall) {
        Task {
            // AppStore.sync()는 로그인 프롬프트를 유발하므로 currentEntitlements 사용
            var purchases: [[String: Any]] = []

            for await verificationResult in Transaction.currentEntitlements {
                if case .verified(let transaction) = verificationResult,
                   transaction.revocationDate == nil {
                    purchases.append([
                        "transactionId": String(transaction.id),
                        "productId":     transaction.productID,
                        "platform":      "ios",
                    ])
                }
            }

            call.resolve(["purchases": purchases])
        }
    }
}
