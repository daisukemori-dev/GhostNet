# GhostNet

GhostNet is a privacy-first group chat built on Zama FHEVM. Each group (a "Ghost") holds a 6-8 digit secret key that
is encrypted on-chain, while messages are encrypted client-side and stored as ciphertext.

## Overview

GhostNet combines on-chain access control with confidential key management. Creators publish an encrypted group key
using Zama's FHEVM. Members receive decryption permission, unlock the key client-side, and use it to encrypt messages
before sending them on-chain. Other members can decrypt messages locally with the same key.

## Problems It Solves

- Secure group key distribution without exposing the key on-chain.
- Permissioned access to group conversations using verifiable on-chain membership.
- Auditable group metadata and membership while keeping message content private.
- A concrete example of combining Zama FHEVM with a modern React front end.

## Advantages

- Encrypted key storage: the group key is stored as an FHE-encrypted value.
- Permissioned decryption: only approved members can decrypt the key through Zama.
- Simple group lifecycle: create, join, decrypt, and send with minimal steps.
- On-chain history with private content: ciphertext is public, plaintext stays local.
- Clear separation of concerns: contract handles membership and storage, UI handles encryption.

## How It Works (End-to-End Flow)

1. Creator generates a 6-8 digit numeric key in the UI.
2. The UI encrypts the key with Zama and calls `createGhost`.
3. The contract stores the encrypted key and grants the creator decrypt permission.
4. A member joins via `joinGhost`, which grants decrypt permission to that member.
5. The member requests decryption using the Zama relayer (EIP-712 signature flow).
6. Messages are XOR-encrypted in the browser and sent to `sendEncryptedMessage`.
7. Other members decrypt messages locally with the same key.

## Architecture

### Smart Contract

- `contracts/GhostNet.sol`: Stores Ghost metadata, encrypted key, and encrypted messages.
- Membership gating: `joinGhost` ensures only members can post or decrypt.
- Encrypted key: stored as `euint32` with `FHE.allow` access control.

### Front End

- `app/`: React + Vite application.
- Reads: `wagmi` + `viem` (`useReadContract`).
- Writes: `ethers` (contract interactions).
- Zama client: encrypts inputs and handles decryption via the relayer.

## Technology Stack

- Hardhat + hardhat-deploy
- Zama FHEVM Solidity library
- ethers v6, TypeChain
- React + Vite
- wagmi + viem
- RainbowKit

## Repository Layout

```
.
├── contracts/              # GhostNet contract
├── deploy/                 # Deployment scripts
├── deployments/            # Network deployments and ABIs
├── tasks/                  # Hardhat tasks
├── test/                   # Contract tests
├── app/                    # Front end
└── hardhat.config.ts       # Hardhat configuration
```

## Getting Started (Contracts)

### Prerequisites

- Node.js 20+
- npm
- A wallet private key funded on Sepolia (for deployment)

### Install Dependencies

```bash
npm install
```

### Environment Variables

Create a `.env` file in the repository root:

```
INFURA_API_KEY=your_infura_key
PRIVATE_KEY=your_wallet_private_key
ETHERSCAN_API_KEY=optional_for_verification
```

These values are loaded in `hardhat.config.ts` using `dotenv`.

### Compile and Test

```bash
npm run compile
npm run test
```

Tests use the local mock FHEVM and will skip if the mock is not available.

### Local Deployment

Start a local node in one terminal:

```bash
npx hardhat node
```

Deploy to the local node in another terminal:

```bash
npx hardhat deploy --network anvil
```

### Deploy to Sepolia

```bash
npx hardhat deploy --network sepolia
```

### Useful Tasks

```bash
# Print the deployed GhostNet address
npx hardhat task:ghost-address --network sepolia

# Create a Ghost with an optional key
npx hardhat task:create-ghost --name "Cipher Club" --key 123456 --network sepolia

# Join a Ghost
npx hardhat task:join-ghost --id 1 --network sepolia

# Show Ghost info and decrypt the key
npx hardhat task:ghost-info --id 1 --network sepolia

# Send an encrypted message
npx hardhat task:send-ghost-message --id 1 --ciphertext "<base64>" --network sepolia
```

## Front End (app)

### Install Dependencies

```bash
cd app
npm install
```

### Configure Contract Address and ABI

1. Deploy the contract to Sepolia.
2. Copy the ABI from `deployments/sepolia/GhostNet.json`.
3. Update `app/src/config/contracts.ts` with:
   - `CONTRACT_ADDRESS` set to the Sepolia address.
   - `CONTRACT_ABI` replaced by the ABI from the deployment file.

No front-end environment variables are used.

### Run the UI

```bash
npm run dev
```

### UI Walkthrough

- Connect a wallet with Sepolia enabled.
- Create a Ghost and generate a 6-8 digit key.
- Join a Ghost to receive decrypt permission.
- Decrypt the key via Zama and send encrypted messages.
- Decrypt messages locally to reveal plaintext.

## Operational Notes

- Decrypted keys are kept in memory only and are not persisted.
- Membership and metadata are public; message plaintext never touches the chain.
- Messages are stored on-chain as base64 ciphertext strings.

## Limitations

- XOR encryption is a simple demo; it is not production-grade cryptography.
- Messages stored on-chain are expensive and not suitable for large payloads.
- Membership lists are public by design.
- No automatic key rotation or revocation yet.

## Future Roadmap

- Replace XOR with stronger encryption (e.g., AES-GCM with per-message keys).
- Key rotation and member removal flows.
- Off-chain message storage with on-chain integrity proofs.
- Message pagination and indexing for large groups.
- Rich media support and attachments.
- Multi-device key sync with secure key derivation.
- Role-based permissions (admins, moderators).
- Gas optimizations for message storage.
- Improved analytics and telemetry for group activity.
- Optional L2 deployment for lower costs.

## License

BSD-3-Clause-Clear. See `LICENSE`.
