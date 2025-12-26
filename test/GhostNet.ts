import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers, fhevm } from "hardhat";
import { FhevmType } from "@fhevm/hardhat-plugin";
import { GhostNet, GhostNet__factory } from "../types";

type Signers = {
  creator: HardhatEthersSigner;
  alice: HardhatEthersSigner;
  bob: HardhatEthersSigner;
};

async function deployFixture() {
  const factory = (await ethers.getContractFactory("GhostNet")) as GhostNet__factory;
  const contract = (await factory.deploy()) as GhostNet;
  const contractAddress = await contract.getAddress();

  return { contract, contractAddress };
}

describe("GhostNet", function () {
  let signers: Signers;
  let contract: GhostNet;
  let contractAddress: string;

  before(async function () {
    const ethSigners: HardhatEthersSigner[] = await ethers.getSigners();
    signers = { creator: ethSigners[0], alice: ethSigners[1], bob: ethSigners[2] };
  });

  beforeEach(async function () {
    if (!fhevm.isMock) {
      console.warn("GhostNet unit tests require the local mock FHEVM");
      this.skip();
    }

    ({ contract, contractAddress } = await deployFixture());
  });

  async function createGhost(secretKey = 12345678) {
    const encryptedKey = await fhevm
      .createEncryptedInput(contractAddress, signers.creator.address)
      .add32(secretKey)
      .encrypt();

    const tx = await contract
      .connect(signers.creator)
      .createGhost("Cipher Club", encryptedKey.handles[0], encryptedKey.inputProof);
    await tx.wait();

    return secretKey;
  }

  it("stores encrypted key and registers creator as member", async function () {
    const secretKey = await createGhost(6543210);
    const ghost = await contract.getGhost(1);

    const decryptedKey = await fhevm.userDecryptEuint(
      FhevmType.euint32,
      ghost[2],
      contractAddress,
      signers.creator,
    );

    expect(decryptedKey).to.equal(secretKey);
    expect(ghost[4]).to.equal(1n);
    expect(await contract.isMember(1, signers.creator.address)).to.equal(true);
  });

  it("allows new members to join and decrypt the key", async function () {
    const secretKey = await createGhost(7777777);

    await expect(contract.connect(signers.alice).joinGhost(1)).to.emit(contract, "MemberJoined");

    const ghost = await contract.getGhost(1);
    expect(ghost[4]).to.equal(2n);
    expect(await contract.isMember(1, signers.alice.address)).to.equal(true);

    const decryptedByAlice = await fhevm.userDecryptEuint(
      FhevmType.euint32,
      ghost[2],
      contractAddress,
      signers.alice,
    );
    expect(decryptedByAlice).to.equal(secretKey);
  });

  it("stores encrypted messages for members and rejects outsiders", async function () {
    await createGhost(1357924);
    await contract.connect(signers.alice).joinGhost(1);

    await expect(
      contract.connect(signers.bob).sendEncryptedMessage(1, "ciphertext-forbidden"),
    ).to.be.revertedWithCustomError(contract, "NotMember");

    await expect(contract.connect(signers.alice).sendEncryptedMessage(1, "ciphertext-hello")).to.emit(
      contract,
      "MessageSent",
    );

    const count = await contract.getMessageCount(1);
    expect(count).to.equal(1n);

    const messages = await contract.getMessages(1, 0, 10);
    expect(messages[0].sender).to.equal(signers.alice.address);
    expect(messages[0].ciphertext).to.equal("ciphertext-hello");
  });
});
