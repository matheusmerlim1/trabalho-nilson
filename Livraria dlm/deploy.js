// scripts/deploy.js
// Instalar: npm install --save-dev hardhat @nomicfoundation/hardhat-toolbox
// Rodar:   npx hardhat run scripts/deploy.js --network sepolia

const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying DLMBookstore com conta:", deployer.address);

  const DLM = await ethers.getContractFactory("DLMBookstore");
  const dlm = await DLM.deploy();
  await dlm.waitForDeployment();

  const address = await dlm.getAddress();
  console.log("✅ DLMBookstore deployado em:", address);
  console.log("Coloque este endereço no .env como CONTRACT_ADDRESS=", address);
}

main().catch((e) => { console.error(e); process.exit(1); });
