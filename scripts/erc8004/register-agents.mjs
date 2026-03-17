/**
 * ERC-8004 Agent Registration Script
 *
 * Base 체인 Identity Registry에 FindThem AI Agent 3명을 각각의 지갑으로 등록합니다.
 *
 * 사전 준비:
 *   .env에 에이전트별 지갑 개인키 설정 (각 지갑에 Base ETH 잔고 필요)
 *     AGENT_WALLET_PK_IMAGE_MATCHING=0x...
 *     AGENT_WALLET_PK_PROMOTION=0x...
 *     AGENT_WALLET_PK_CHATBOT_ALERT=0x...
 *
 * 실행:
 *   node scripts/erc8004/register-agents.mjs [--testnet] [--only image-matching]
 *
 * --testnet          Base Sepolia에 등록 (테스트용)
 * --only <agentId>   특정 에이전트만 등록
 */

import { createWalletClient, createPublicClient, http, parseAbi } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base, baseSepolia } from 'viem/chains';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';

// .env 로드 (프로젝트 루트 기준)
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../apps/api/.env') });

// ── CLI Args ──

const isTestnet = process.argv.includes('--testnet');
const onlyIdx = process.argv.indexOf('--only');
const onlyAgent = onlyIdx !== -1 ? process.argv[onlyIdx + 1] : null;

// ── Chain Config ──

const IDENTITY_REGISTRY = isTestnet
  ? '0x8004A818BFB912233c491871b3d84c89A494BD9e' // Base Sepolia
  : '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432'; // Base Mainnet

const chain = isTestnet ? baseSepolia : base;
const rpcUrl = process.env.BASE_RPC_URL || (isTestnet ? 'https://sepolia.base.org' : 'https://mainnet.base.org');

// ── ABI ──

const registryAbi = parseAbi([
  'function register(string agentURI) external returns (uint256 agentId)',
  'event Registered(uint256 indexed agentId, string agentURI, address indexed owner)',
]);

// ── Agent 정의 (에이전트별 개별 지갑) ──

const agents = [
  {
    id: 'image-matching',
    name: 'Detective Claude (탐정 클로드)',
    file: 'agents/detective-claude.json',
    pkEnv: 'AGENT_WALLET_PK_IMAGE_MATCHING',
  },
  {
    id: 'promotion',
    name: 'Promo Queen Hermy (홍보왕 헤르미)',
    file: 'agents/promo-queen-hermy.json',
    pkEnv: 'AGENT_WALLET_PK_PROMOTION',
  },
  {
    id: 'chatbot-alert',
    name: 'Guide Bot Ali (안내봇 알리)',
    file: 'agents/guide-bot-ali.json',
    pkEnv: 'AGENT_WALLET_PK_CHATBOT_ALERT',
  },
];

// ── Main ──

async function main() {
  console.log(`\n=== ERC-8004 Agent Registration ===`);
  console.log(`Chain:    ${chain.name} (${chain.id})`);
  console.log(`Registry: ${IDENTITY_REGISTRY}\n`);

  const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });

  // 등록 대상 필터
  const targets = onlyAgent
    ? agents.filter((a) => a.id === onlyAgent)
    : agents;

  if (targets.length === 0) {
    console.error(`ERROR: 알 수 없는 에이전트 ID: ${onlyAgent}`);
    console.error(`  사용 가능: ${agents.map((a) => a.id).join(', ')}`);
    process.exit(1);
  }

  // 지갑 유효성 사전 확인
  for (const agent of targets) {
    const pk = process.env[agent.pkEnv];
    if (!pk) {
      console.error(`ERROR: ${agent.pkEnv} 환경변수가 설정되지 않았습니다.`);
      console.error(`  .env에 추가: ${agent.pkEnv}=0x...`);
      process.exit(1);
    }
    // 0x 접두사 자동 보정
    if (!pk.startsWith('0x')) {
      process.env[agent.pkEnv] = `0x${pk}`;
    }
  }

  const results = [];

  for (const agent of targets) {
    const pk = process.env[agent.pkEnv];
    const account = privateKeyToAccount(pk);

    console.log(`\n--- ${agent.name} ---`);
    console.log(`  Wallet: ${account.address}`);

    // 잔고 확인
    const balance = await publicClient.getBalance({ address: account.address });
    const ethBalance = Number(balance) / 1e18;
    console.log(`  Balance: ${ethBalance.toFixed(6)} ETH`);

    if (ethBalance < 0.0003) {
      console.error(`  SKIP: 잔고 부족 (최소 0.0003 ETH 필요)`);
      results.push({ ...agent, wallet: account.address, agentId: null, txHash: null, status: 'skipped', error: 'insufficient balance' });
      continue;
    }

    // Registration file → base64 data URI
    const jsonPath = resolve(__dirname, agent.file);
    const jsonContent = readFileSync(jsonPath, 'utf-8');
    const base64 = Buffer.from(jsonContent).toString('base64');
    const agentURI = `data:application/json;base64,${base64}`;

    const walletClient = createWalletClient({ account, chain, transport: http(rpcUrl) });

    try {
      // 가스 추정
      const gasEstimate = await publicClient.estimateContractGas({
        address: IDENTITY_REGISTRY,
        abi: registryAbi,
        functionName: 'register',
        args: [agentURI],
        account: account.address,
      });
      console.log(`  Gas estimate: ${gasEstimate}`);

      // TX 전송
      const hash = await walletClient.writeContract({
        address: IDENTITY_REGISTRY,
        abi: registryAbi,
        functionName: 'register',
        args: [agentURI],
      });
      console.log(`  TX hash: ${hash}`);

      // 영수증 대기
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      console.log(`  Status: ${receipt.status}`);

      // agentId 추출 — ERC-721 Transfer(address(0), to, tokenId) 이벤트의 topics[3]
      const ERC721_TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
      const transferLog = receipt.logs.find(
        (log) => log.topics.length === 4 && log.topics[0] === ERC721_TRANSFER_TOPIC,
      );
      const agentId = transferLog ? BigInt(transferLog.topics[3]).toString() : 'unknown';
      console.log(`  Agent ID (on-chain): ${agentId}`);

      results.push({ ...agent, wallet: account.address, agentId, txHash: hash, status: 'success' });
    } catch (err) {
      console.error(`  FAILED: ${err.message}`);
      results.push({ ...agent, wallet: account.address, agentId: null, txHash: null, status: 'failed', error: err.message });
    }
  }

  // ── 결과 요약 ──
  const explorer = isTestnet ? 'https://sepolia.basescan.org' : 'https://basescan.org';

  console.log('\n\n=== Registration Summary ===\n');
  for (const r of results) {
    const icon = r.status === 'success' ? '✅' : r.status === 'skipped' ? '⏭️' : '❌';
    console.log(`${icon} ${r.name}`);
    console.log(`   Wallet:   ${r.wallet}`);
    if (r.agentId) console.log(`   Agent ID: ${r.agentId}`);
    if (r.txHash) console.log(`   TX: ${explorer}/tx/${r.txHash}`);
    if (r.error) console.log(`   Error: ${r.error}`);
  }

  // JSON 저장
  const outputPath = resolve(__dirname, 'registration-result.json');
  writeFileSync(outputPath, JSON.stringify({
    chain: chain.name,
    chainId: chain.id,
    registry: IDENTITY_REGISTRY,
    timestamp: new Date().toISOString(),
    agents: results.map(({ id, name, wallet, agentId, txHash, status }) => ({
      id, name, wallet, agentId, txHash, status,
    })),
  }, null, 2));
  console.log(`\nResults saved to: ${outputPath}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
