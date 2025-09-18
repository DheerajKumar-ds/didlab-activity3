import "dotenv/config";
import { artifacts } from "hardhat";
import { createWalletClient, createPublicClient, http, parseUnits, formatUnits, getAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const RPC_URL = process.env.RPC_URL!;
const CHAIN_ID = Number(process.env.CHAIN_ID!);
const PRIVATE_KEY = (process.env.PRIVATE_KEY || "").replace(/^0x/, "");
const TOKEN = process.env.TOKEN_ADDRESS as `0x${string}`;

async function main() {
  if (!RPC_URL || !CHAIN_ID || !PRIVATE_KEY || !TOKEN) throw new Error("Missing env");

  const { abi } = await artifacts.readArtifact("CampusCreditV2");
  const chain = { id: CHAIN_ID, name: `didlab-${CHAIN_ID}`, nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [RPC_URL] } } } as const;

  const account = privateKeyToAccount(`0x${PRIVATE_KEY}`);
  const wallet = createWalletClient({ account, chain, transport: http(RPC_URL) });
  const publicClient = createPublicClient({ chain, transport: http(RPC_URL) });

  // 3–6 addresses (replace/add your teammates if needed)
  const recipients = [
    getAddress(account.address),
    "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", // Hardhat Account #1
    "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC", // Hardhat Account #2
  ];
  const amounts = recipients.map(() => parseUnits("10", 18));

  // Helper: fetch balances
  async function printBalances(label: string) {
    const balances = await Promise.all(
      recipients.map(addr =>
        publicClient.readContract({ address: TOKEN, abi, functionName: "balanceOf", args: [addr] }) as Promise<bigint>
      )
    );
    console.log(`\n${label}`);
    recipients.forEach((addr, i) => {
      console.log(`  ${addr}: ${formatUnits(balances[i], 18)} CAMP`);
    });
  }

  // Before
  await printBalances("Before Airdrop");

  // Batch airdrop
  const txBatch = await wallet.writeContract({
    address: TOKEN, abi, functionName: "airdrop", args: [recipients, amounts],
    maxPriorityFeePerGas: 2_000_000_000n, maxFeePerGas: 22_000_000_000n
  });
  const rBatch = await publicClient.waitForTransactionReceipt({ hash: txBatch });
  const feeBatch = rBatch.gasUsed * (rBatch.effectiveGasPrice ?? 0n);
  console.log("\nBatch Airdrop:", txBatch, "gasUsed:", rBatch.gasUsed.toString(), "fee(wei):", feeBatch.toString());

  await printBalances("After Batch Airdrop");

  // Singles for comparison
  let totalGas = 0n, totalFee = 0n;
  for (let i = 0; i < recipients.length; i++) {
    const tx = await wallet.writeContract({
      address: TOKEN, abi, functionName: "transfer", args: [recipients[i], amounts[i]],
      maxPriorityFeePerGas: 2_000_000_000n, maxFeePerGas: 22_000_000_000n
    });
    const r = await publicClient.waitForTransactionReceipt({ hash: tx });
    totalGas += r.gasUsed;
    totalFee += r.gasUsed * (r.effectiveGasPrice ?? 0n);
  }
  console.log("\nSingles total gasUsed:", totalGas.toString(), "fee(wei):", totalFee.toString());

  await printBalances("After Singles");

  if (totalGas > 0n) {
    const saved = (Number(totalGas - rBatch.gasUsed) / Number(totalGas) * 100).toFixed(2);
    console.log(`\nBatch saved ≈ ${saved}% gas vs singles`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
