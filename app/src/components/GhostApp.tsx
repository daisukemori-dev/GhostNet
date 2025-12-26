import { useEffect, useMemo, useState } from 'react';
import { useAccount, useReadContract } from 'wagmi';
import { Contract } from 'ethers';

import { Header } from './Header';
import { useZamaInstance } from '../hooks/useZamaInstance';
import { useEthersSigner } from '../hooks/useEthersSigner';
import { CONTRACT_ADDRESS, CONTRACT_ABI } from '../config/contracts';
import { encryptWithKey, decryptWithKey } from '../utils/crypto';
import '../styles/GhostApp.css';

type Ghost = {
  id: number;
  name: string;
  creator: string;
  encryptedKey: string;
  createdAt: bigint;
  memberCount: bigint;
};

type GhostMessage = {
  sender: string;
  ciphertext: string;
  timestamp: bigint;
};

export function GhostApp() {
  const { address, isConnected } = useAccount();
  const { instance, isLoading: zamaLoading, error: zamaError } = useZamaInstance();
  const signer = useEthersSigner();
  const hasContractAddress = true;

  const [ghostName, setGhostName] = useState('');
  const [generatedKey, setGeneratedKey] = useState('');
  const [selectedGhostId, setSelectedGhostId] = useState<number | null>(null);
  const [decryptedKeys, setDecryptedKeys] = useState<Record<number, string>>({});
  const [messageInput, setMessageInput] = useState('');
  const [creating, setCreating] = useState(false);
  const [joiningId, setJoiningId] = useState<number | null>(null);
  const [decryptingId, setDecryptingId] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  const {
    data: ghostsData,
    refetch: refetchGhosts,
    isLoading: ghostsLoading,
  } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'getAllGhosts',
    query: { enabled: hasContractAddress },
  });

  const ghosts = useMemo<Ghost[]>(() => {
    if (!Array.isArray(ghostsData)) return [];
    return (ghostsData as any[]).map((ghost, index) => {
      const g: any = ghost as any;
      return {
        id: index + 1,
        name: g.name ?? g[0],
        creator: g.creator ?? g[1],
        encryptedKey: g.encryptedKey ?? g[2],
        createdAt: BigInt(g.createdAt ?? g[3]),
        memberCount: BigInt(g.memberCount ?? g[4]),
      };
    });
  }, [ghostsData]);

  useEffect(() => {
    if (!selectedGhostId && ghosts.length > 0) {
      setSelectedGhostId(ghosts[0].id);
    }
  }, [ghosts, selectedGhostId]);

  const {
    data: membershipData,
    refetch: refetchMembership,
  } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'isMember',
    args: selectedGhostId && address ? [BigInt(selectedGhostId), address] : undefined,
    query: { enabled: !!selectedGhostId && !!address && hasContractAddress },
  });

  const { data: messagesData, refetch: refetchMessages } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'getMessages',
    args: selectedGhostId ? [BigInt(selectedGhostId), 0n, 50n] : undefined,
    query: { enabled: !!selectedGhostId && hasContractAddress },
  });

  const messages = useMemo<GhostMessage[]>(() => {
    if (!Array.isArray(messagesData)) return [];
    return (messagesData as any[]).map((msg) => {
      const m: any = msg as any;
      return {
        sender: m.sender ?? m[0],
        ciphertext: m.ciphertext ?? m[1],
        timestamp: BigInt(m.timestamp ?? m[2]),
      };
    });
  }, [messagesData]);

  const isMember = Boolean(membershipData);

  const handleGenerateKey = () => {
    const random = Math.floor(100000 + Math.random() * 90000000);
    setGeneratedKey(random.toString());
    setStatusMessage('');
  };

  const handleCreateGhost = async () => {
    if (!address || !signer || !instance) {
      setStatusMessage('Connect wallet and wait for Zama to finish loading.');
      return;
    }
    if (!hasContractAddress) {
      setStatusMessage('Deploy GhostNet to Sepolia and update CONTRACT_ADDRESS first.');
      return;
    }
    if (!ghostName.trim()) {
      setStatusMessage('Name is required.');
      return;
    }
    const numericKey = parseInt(generatedKey, 10);
    if (!Number.isInteger(numericKey) || numericKey < 100000 || numericKey > 99999999) {
      setStatusMessage('Generate a 6-8 digit key first.');
      return;
    }

    setCreating(true);
    setStatusMessage('Encrypting key with Zama...');

    try {
      const input = instance.createEncryptedInput(CONTRACT_ADDRESS, address);
      input.add32(numericKey);
      const encrypted = await input.encrypt();

      const resolvedSigner = await signer;
      if (!resolvedSigner) {
        throw new Error('Signer not available');
      }

      const contract = new Contract(CONTRACT_ADDRESS, CONTRACT_ABI, resolvedSigner);
      const tx = await contract.createGhost(ghostName.trim(), encrypted.handles[0], encrypted.inputProof);
      setStatusMessage('Waiting for confirmation...');
      await tx.wait();

      await refetchGhosts();
      const newId = ghosts.length + 1;
      setSelectedGhostId(newId);
      setDecryptedKeys((prev) => ({ ...prev, [newId]: generatedKey }));

      setGhostName('');
      setGeneratedKey('');
      setStatusMessage('Ghost created and key cached locally.');
    } catch (error) {
      console.error('Failed to create Ghost', error);
      setStatusMessage('Failed to create Ghost. Check console for details.');
    } finally {
      setCreating(false);
    }
  };

  const handleJoinGhost = async (ghostId: number) => {
    if (!address || !signer) {
      setStatusMessage('Connect your wallet to join.');
      return;
    }
    if (!hasContractAddress) {
      setStatusMessage('Deploy GhostNet to Sepolia and update CONTRACT_ADDRESS first.');
      return;
    }
    setJoiningId(ghostId);
    setStatusMessage('');
    try {
      const resolvedSigner = await signer;
      if (!resolvedSigner) {
        throw new Error('Signer not available');
      }

      const contract = new Contract(CONTRACT_ADDRESS, CONTRACT_ABI, resolvedSigner);
      const tx = await contract.joinGhost(ghostId);
      setStatusMessage('Joining Ghost...');
      await tx.wait();
      await Promise.all([refetchGhosts(), refetchMembership?.()]);
      setStatusMessage('Joined Ghost. Request decryption to unlock the key.');
    } catch (error) {
      console.error('Failed to join Ghost', error);
      setStatusMessage('Join failed. You may already be a member.');
    } finally {
      setJoiningId(null);
    }
  };

  const handleDecryptKey = async (ghost: Ghost) => {
    if (!instance || !address || !signer) {
      setStatusMessage('Connect wallet and wait for Zama to load.');
      return;
    }
    if (!hasContractAddress) {
      setStatusMessage('Deploy GhostNet to Sepolia and update CONTRACT_ADDRESS first.');
      return;
    }
    setDecryptingId(ghost.id);
    setStatusMessage('Requesting decrypt session...');
    try {
      const keypair = instance.generateKeypair();
      const handleContractPairs = [{ handle: ghost.encryptedKey, contractAddress: CONTRACT_ADDRESS }];
      const startTimeStamp = Math.floor(Date.now() / 1000).toString();
      const durationDays = '10';
      const contractAddresses = [CONTRACT_ADDRESS];
      const eip712 = instance.createEIP712(keypair.publicKey, contractAddresses, startTimeStamp, durationDays);

      const resolvedSigner = await signer;
      if (!resolvedSigner) {
        throw new Error('Signer not available');
      }

      const signature = await resolvedSigner.signTypedData(
        eip712.domain,
        { UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification },
        eip712.message
      );

      const result = await instance.userDecrypt(
        handleContractPairs,
        keypair.privateKey,
        keypair.publicKey,
        signature.replace('0x', ''),
        contractAddresses,
        address,
        startTimeStamp,
        durationDays
      );

      const decryptedKey = result[ghost.encryptedKey as keyof typeof result];
      if (!decryptedKey) {
        throw new Error('Decrypt result empty');
      }

      setDecryptedKeys((prev) => ({ ...prev, [ghost.id]: decryptedKey }));
      setStatusMessage('Key decrypted. You can now encrypt messages.');
    } catch (error) {
      console.error('Failed to decrypt key', error);
      setStatusMessage('Decrypt failed. Make sure you are a member.');
    } finally {
      setDecryptingId(null);
    }
  };

  const handleSendMessage = async () => {
    if (!selectedGhostId) return;
    const key = decryptedKeys[selectedGhostId];
    if (!key) {
      setStatusMessage('Decrypt the Ghost key first.');
      return;
    }
    if (!messageInput.trim()) {
      setStatusMessage('Enter a message to send.');
      return;
    }
    if (!signer || !address) {
      setStatusMessage('Connect your wallet.');
      return;
    }
    if (!hasContractAddress) {
      setStatusMessage('Deploy GhostNet to Sepolia and update CONTRACT_ADDRESS first.');
      return;
    }

    setSending(true);
    try {
      const ciphertext = encryptWithKey(key, messageInput.trim());

      const resolvedSigner = await signer;
      if (!resolvedSigner) {
        throw new Error('Signer not available');
      }
      const contract = new Contract(CONTRACT_ADDRESS, CONTRACT_ABI, resolvedSigner);
      const tx = await contract.sendEncryptedMessage(selectedGhostId, ciphertext);
      setStatusMessage('Sending encrypted message...');
      await tx.wait();
      setMessageInput('');
      await refetchMessages?.();
      setStatusMessage('Message sent.');
    } catch (error) {
      console.error('Failed to send message', error);
      setStatusMessage('Send failed. Are you a member?');
    } finally {
      setSending(false);
    }
  };

  const selectedGhost = ghosts.find((g) => g.id === selectedGhostId);
  const decryptedKeyForSelected = selectedGhostId ? decryptedKeys[selectedGhostId] : '';

  return (
    <div className="ghost-app">
      <Header />

      <main className="ghost-shell">
        {!hasContractAddress && (
          <div className="panel glass warning">
            <p className="eyebrow">Action needed</p>
            <p className="muted">
              No Sepolia address detected. Deploy GhostNet with your PRIVATE_KEY and update CONTRACT_ADDRESS to enable on-chain reads.
            </p>
          </div>
        )}

        <section className="panel-grid">
          <div className="panel glass">
            <div className="panel-head">
              <div>
                <p className="eyebrow">Create Ghost</p>
                <h2 className="panel-title">Launch a new encrypted room</h2>
                <p className="muted">Generate a 6-8 digit secret key, encrypt with Zama, and deploy it on-chain.</p>
              </div>
            </div>

            <div className="form-row">
              <label>Ghost name</label>
              <input
                className="text-input"
                value={ghostName}
                onChange={(e) => setGhostName(e.target.value)}
                placeholder="Ex: Midnight Operators"
              />
            </div>

            <div className="form-row dual">
              <div className="inline-field">
                <label>Secret key</label>
                <input
                  className="text-input"
                  value={generatedKey}
                  onChange={(e) => setGeneratedKey(e.target.value.replace(/\D/g, ''))}
                  placeholder="Generate a 6-8 digit key"
                />
              </div>
              <button className="ghost-button secondary" type="button" onClick={handleGenerateKey}>
                Randomize
              </button>
            </div>

            <div className="actions">
              <button
                className="ghost-button primary"
                type="button"
                disabled={creating || zamaLoading || !hasContractAddress}
                onClick={handleCreateGhost}
              >
                {creating
                  ? 'Publishing...'
                  : zamaLoading
                    ? 'Loading Zama...'
                    : hasContractAddress
                      ? 'Create Ghost'
                      : 'Set contract address'}
              </button>
              <p className="status-text">{statusMessage}</p>
              {zamaError && <p className="error-text">{zamaError}</p>}
            </div>
          </div>

          <div className="panel ghost-list glass">
            <div className="panel-head">
              <div>
                <p className="eyebrow">Ghost Lobby</p>
                <h2 className="panel-title">Join existing encrypted crews</h2>
                <p className="muted">
                  Select a Ghost to view details, request the key, and read encrypted drops.
                </p>
              </div>
              <div className="pill">{ghosts.length} live</div>
            </div>

            <div className="ghost-cards">
              {ghostsLoading && <p className="muted">Loading ghosts...</p>}
              {!ghostsLoading && ghosts.length === 0 && <p className="muted">No Ghosts yet. Start one above.</p>}
              {ghosts.map((ghost) => (
                <button
                  key={ghost.id}
                  className={`ghost-card ${selectedGhostId === ghost.id ? 'active' : ''}`}
                  onClick={() => setSelectedGhostId(ghost.id)}
                >
                  <div className="ghost-card-head">
                    <div>
                      <p className="eyebrow">Ghost #{ghost.id}</p>
                      <h3>{ghost.name}</h3>
                    </div>
                    <span className="pill">{Number(ghost.memberCount)} members</span>
                  </div>
                  <div className="ghost-card-meta">
                    <span>Creator: {ghost.creator.slice(0, 6)}…{ghost.creator.slice(-4)}</span>
                    <span>
                      Created: {new Date(Number(ghost.createdAt) * 1000).toLocaleString(undefined, { hour12: false })}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="panel chat glass">
          {selectedGhost ? (
            <>
              <div className="panel-head chat-head">
                <div>
                  <p className="eyebrow">Ghost #{selectedGhost.id}</p>
                  <h2 className="panel-title">{selectedGhost.name}</h2>
                  <p className="muted">
                    Encrypted key stored on-chain. Members can decrypt with Zama and encrypt messages with it.
                  </p>
                </div>
                <div className="chip-row">
                  <span className="pill subtle">Members {Number(selectedGhost.memberCount)}</span>
                  {isMember ? (
                    <span className="pill success">You are in</span>
                  ) : (
                  <button
                    className="ghost-button tertiary"
                    type="button"
                    disabled={joiningId === selectedGhost.id || !isConnected || !hasContractAddress}
                    onClick={() => handleJoinGhost(selectedGhost.id)}
                  >
                    {joiningId === selectedGhost.id ? 'Joining...' : 'Join Ghost'}
                  </button>
                  )}
                  <button
                    className="ghost-button"
                    type="button"
                    disabled={decryptingId === selectedGhost.id || !isMember || !hasContractAddress}
                    onClick={() => handleDecryptKey(selectedGhost)}
                  >
                    {decryptingId === selectedGhost.id ? 'Decrypting...' : 'Decrypt key'}
                  </button>
                </div>
              </div>

              <div className="key-box">
                <div>
                  <p className="eyebrow">Encrypted key handle</p>
                  <code className="code">{selectedGhost.encryptedKey}</code>
                </div>
                <div className="key-status">
                  <p className="muted">Decrypted key</p>
                  <p className="key-value">{decryptedKeyForSelected || 'Locked until you decrypt'}</p>
                </div>
              </div>

              <div className="message-composer">
                <textarea
                  placeholder={
                    decryptedKeyForSelected
                      ? 'Type a message to encrypt with the Ghost key...'
                      : 'Decrypt the key before sending...'
                  }
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  disabled={!decryptedKeyForSelected || sending}
                />
                <div className="composer-actions">
                  <span className="muted">
                    Messages are XOR-encrypted with the Ghost key in-browser, ciphertext stored on-chain.
                  </span>
                  <button
                    className="ghost-button primary"
                    type="button"
                    disabled={!decryptedKeyForSelected || sending}
                    onClick={handleSendMessage}
                  >
                    {sending ? 'Sending...' : 'Send encrypted'}
                  </button>
                </div>
              </div>

              <div className="message-list">
                <div className="list-head">
                  <p className="eyebrow">Encrypted feed</p>
                  <button className="ghost-button tertiary" type="button" onClick={() => refetchMessages?.()}>
                    Refresh
                  </button>
                </div>
                {messages.length === 0 && <p className="muted">No messages yet.</p>}
                {messages.map((msg, idx) => {
                  let decrypted = '';
                  if (decryptedKeyForSelected) {
                    try {
                      decrypted = decryptWithKey(decryptedKeyForSelected, msg.ciphertext);
                    } catch (err) {
                      console.warn('Unable to decrypt message', err);
                      decrypted = '[Unable to decrypt with the current key]';
                    }
                  }
                  return (
                    <div key={`${msg.sender}-${idx}`} className="message">
                      <div className="message-top">
                        <span className="pill subtle">{msg.sender.slice(0, 6)}…{msg.sender.slice(-4)}</span>
                        <span className="muted">
                          {new Date(Number(msg.timestamp) * 1000).toLocaleString(undefined, { hour12: false })}
                        </span>
                      </div>
                      <p className="ciphertext">{msg.ciphertext}</p>
                      {decryptedKeyForSelected ? (
                        <p className="plaintext">{decrypted}</p>
                      ) : (
                        <p className="muted">Decrypt the key to reveal this message.</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <p className="muted">Select a Ghost from the lobby to start.</p>
          )}
        </section>
      </main>
    </div>
  );
}
