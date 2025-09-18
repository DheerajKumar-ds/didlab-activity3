import "dotenv/config";
import { artifacts } from "hardhat";
import {
  createWalletClient,
  createPublicClient,
  http,
  parseUnits,
  formatUnits,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const RPC_URL = process.env.RPC_URL || "http://127.0.0.1:8545";
const CHAIN_ID = Number(process.env.CHAIN_ID || "31337");
const PRIVATE_KEY = (process.env.PRIVATE_KEY || "").replace(/^0x/, "");
const TOKEN_ADDRESS = process.env.TOKEN_ADDRESS!;
const RECIPIENT = process.env.RECIPIENT!;

async function main() {
  if (!RPC_URL || !CHAIN_ID || !PRIVATE_KEY || !TOKEN_ADDRESS || !RECIPIENT) {
    throw new Error("Missing env");
  }

  // Load ABI
  const { abi } = await artifacts.readArtifact("CampusCreditV2");

  // Chain & clients
  const chain = {
    id: CHAIN_ID,
    name: `local-${CHAIN_ID}`,
    nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [RPC_URL] } },
  } as const;

  const account = privateKeyToAccount(`0x${PRIVATE_KEY}`);
  const wallet = createWalletClient({ account, chain, transport: http(RPC_URL) });
  const publicClient = createPublicClient({ chain, transport: http(RPC_URL) });

  // Helper to read balances
  const getBalance = async (addr: string) => {
    const bal = await publicClient.readContract({
      address: TOKEN_ADDRESS,
      abi,
      functionName: "balanceOf",
      args: [addr],
    });
    return formatUnits(bal as bigint, 18);
  };

  console.log(
    `Before | Me: ${await getBalance(account.address)} CAMP | You: ${await getBalance(
      RECIPIENT
    )} CAMP`
  );

  // --- Transfer 50 CAMP ---
  const transferTx = await wallet.writeContract({
    address: TOKEN_ADDRESS,
    abi,
    functionName: "transfer",
    args: [RECIPIENT, parseUnits("50", 18)],
  });
  const transferRcpt = await publicClient.waitForTransactionReceipt({ hash: transferTx });
  console.log(`transfer tx: ${transferTx} gasUsed: ${transferRcpt.gasUsed}`);

  // --- Approve 25 CAMP ---
  const approveTx = await wallet.writeContract({
    address: TOKEN_ADDRESS,
    abi,
    functionName: "approve",
    args: [RECIPIENT, parseUnits("25", 18)],
  });
  const approveRcpt = await publicClient.waitForTransactionReceipt({ hash: approveTx });
  console.log(`approve  tx: ${approveTx} gasUsed: ${approveRcpt.gasUsed}`);

  // --- Check allowance ---
  const allowance = await publicClient.readContract({
    address: TOKEN_ADDRESS,
    abi,
    functionName: "allowance",
    args: [account.address, RECIPIENT],
  });
  console.log(`allowance: ${formatUnits(allowance as bigint, 18)} CAMP`);

  console.log(
    `After | Me: ${await getBalance(account.address)} CAMP | You: ${await getBalance(
      RECIPIENT
    )} CAMP`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
