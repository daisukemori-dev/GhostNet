import { FhevmType } from "@fhevm/hardhat-plugin";
import { task } from "hardhat/config";
import type { TaskArguments } from "hardhat/types";

task("task:ghost-address", "Prints the GhostNet address").setAction(async function (_taskArguments: TaskArguments, hre) {
  const deployment = await hre.deployments.get("GhostNet");
  console.log("GhostNet address:", deployment.address);
});

task("task:create-ghost", "Create a new Ghost with an encrypted key")
  .addParam("name", "Ghost name")
  .addOptionalParam("key", "Optional numeric key (6-8 digits). Random if omitted")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments, fhevm } = hre;

    await fhevm.initializeCLIApi();

    const deployment = await deployments.get("GhostNet");
    const contract = await ethers.getContractAt("GhostNet", deployment.address);
    const signer = (await ethers.getSigners())[0];

    const key =
      taskArguments.key !== undefined
        ? parseInt(taskArguments.key)
        : Math.floor(100000 + Math.random() * 90000000);

    if (!Number.isInteger(key) || key < 100000 || key > 99999999) {
      throw new Error("Key must be a 6-8 digit integer");
    }

    const encryptedKey = await fhevm.createEncryptedInput(deployment.address, signer.address).add32(key).encrypt();

    const tx = await contract
      .connect(signer)
      .createGhost(taskArguments.name, encryptedKey.handles[0], encryptedKey.inputProof);
    console.log(`Creating Ghost "${taskArguments.name}" with key ${key}, tx=${tx.hash}`);
    await tx.wait();

    console.log("Ghost created!");
  });

task("task:join-ghost", "Join a Ghost and receive decrypt permission")
  .addParam("id", "Ghost id")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments } = hre;
    const deployment = await deployments.get("GhostNet");
    const contract = await ethers.getContractAt("GhostNet", deployment.address);
    const signer = (await ethers.getSigners())[0];

    const tx = await contract.connect(signer).joinGhost(parseInt(taskArguments.id));
    console.log(`Joining Ghost ${taskArguments.id}, tx=${tx.hash}`);
    await tx.wait();

    console.log("Joined Ghost");
  });

task("task:ghost-info", "Show Ghost details and decrypt key")
  .addParam("id", "Ghost id")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments, fhevm } = hre;

    await fhevm.initializeCLIApi();

    const deployment = await deployments.get("GhostNet");
    const contract = await ethers.getContractAt("GhostNet", deployment.address);
    const signer = (await ethers.getSigners())[0];
    const ghostId = parseInt(taskArguments.id);

    const ghost = await contract.getGhost(ghostId);
    console.log("Ghost:", {
      id: ghostId,
      name: ghost[0],
      creator: ghost[1],
      createdAt: new Date(Number(ghost[3]) * 1000).toISOString(),
      members: Number(ghost[4]),
    });

    const key = await fhevm.userDecryptEuint(FhevmType.euint32, ghost[2], deployment.address, signer);
    console.log("Decrypted key:", key);
  });

task("task:send-ghost-message", "Send an encrypted message to a Ghost")
  .addParam("id", "Ghost id")
  .addParam("ciphertext", "Ciphertext produced off-chain with the Ghost key")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments } = hre;

    const deployment = await deployments.get("GhostNet");
    const contract = await ethers.getContractAt("GhostNet", deployment.address);
    const signer = (await ethers.getSigners())[0];
    const ghostId = parseInt(taskArguments.id);

    const tx = await contract.connect(signer).sendEncryptedMessage(ghostId, taskArguments.ciphertext);
    console.log(`Sending message to Ghost ${ghostId}, tx=${tx.hash}`);
    await tx.wait();

    console.log("Message sent");
  });
