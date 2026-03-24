import { useState, useEffect } from 'react';

// ============================================================
//  CONTRACT CONFIG — Update CONTRACT_ID if you redeploy!
// ============================================================
const CONTRACT_ID = 'CABDKG5Y4RPJHW6QHHH5B3NFNAKS4UIAKEYLCIZFL7IJ6ZP5PXFG7FAX';
const RPC_URL     = 'https://soroban-testnet.stellar.org';
const NETWORK_PASSPHRASE = 'Test SDF Network ; September 2015';

function App() {
  const [pubKey, setPubKey]           = useState('');
  const [secretKey, setSecretKey]     = useState('');
  const [message, setMessage]         = useState('');
  const [newMessage, setNewMessage]   = useState('');
  const [status, setStatus]           = useState('');
  const [loading, setLoading]         = useState(false);
  const [fetching, setFetching]       = useState(true);
  const [useDemo, setUseDemo]         = useState(false);
  const [demoKeyInput, setDemoKeyInput] = useState('');

  useEffect(() => {
    fetchCurrentMessage();
  }, []);

  // ─── Freighter Wallet Connection ───────────────────────────
  const connectFreighter = async () => {
    try {
      setStatus('Connecting to Freighter...');
      const freighterApi = await import('@stellar/freighter-api');

      if (!(await freighterApi.isConnected())) {
        setStatus('Freighter extension not found! Use Demo Mode instead.');
        return;
      }
      const { address } = await freighterApi.requestAccess();
      if (address) {
        setPubKey(address);
        setUseDemo(false);
        setStatus('');
      } else {
        setStatus('Wallet connection was rejected.');
      }
    } catch (err) {
      console.error(err);
      setStatus('Freighter not available. Try Demo Mode!');
    }
  };

  // ─── Demo Mode: Connect with Secret Key ────────────────────
  const connectDemo = async () => {
    if (!demoKeyInput.startsWith('S') || demoKeyInput.length !== 56) {
      setStatus('Enter a valid Stellar secret key (starts with S, 56 chars)');
      return;
    }
    try {
      const StellarSdk = await import('@stellar/stellar-sdk');
      const keypair = StellarSdk.Keypair.fromSecret(demoKeyInput);
      setPubKey(keypair.publicKey());
      setSecretKey(demoKeyInput);
      setUseDemo(true);
      setStatus('');
    } catch (err) {
      setStatus('Invalid secret key format.');
    }
  };

  // ─── Read Current Message via Simulated Contract Call ──────
  const fetchCurrentMessage = async () => {
    setFetching(true);
    try {
      const StellarSdk = await import('@stellar/stellar-sdk');
      const server = new StellarSdk.rpc.Server(RPC_URL, { allowHttp: true });

      const contract = new StellarSdk.Contract(CONTRACT_ID);

      // Build a read-only transaction to simulate get_message
      // We need any valid account — use the contract address itself as source
      const randomKeypair = StellarSdk.Keypair.random();
      const tempAccount = new StellarSdk.Account(randomKeypair.publicKey(), '0');

      const tx = new StellarSdk.TransactionBuilder(tempAccount, {
        fee: '100',
        networkPassphrase: NETWORK_PASSPHRASE,
      })
        .addOperation(contract.call('get_message'))
        .setTimeout(30)
        .build();

      const simResult = await server.simulateTransaction(tx);

      if (StellarSdk.rpc.Api.isSimulationSuccess(simResult) && simResult.result) {
        const retVal = StellarSdk.xdr.ScVal.fromXDR(simResult.result.retval.toXDR());
        const nativeVal = StellarSdk.scValToNative(retVal);
        setMessage(String(nativeVal));
      } else {
        setMessage('No message set yet!');
      }
    } catch (e) {
      console.error('Error reading contract:', e);
      setMessage('Could not read contract — is your local node running?');
    }
    setFetching(false);
  };

  // ─── Write New Message to Contract ─────────────────────────
  const handleSetMessage = async (e) => {
    e.preventDefault();
    if (!pubKey) return alert('Connect a wallet or use Demo Mode first!');
    if (!newMessage) return;

    setLoading(true);
    setStatus('Preparing transaction...');

    try {
      const StellarSdk = await import('@stellar/stellar-sdk');
      const server = new StellarSdk.rpc.Server(RPC_URL, { allowHttp: true });

      const account  = await server.getAccount(pubKey);
      const contract = new StellarSdk.Contract(CONTRACT_ID);

      let tx = new StellarSdk.TransactionBuilder(account, {
        fee: '1000000',
        networkPassphrase: NETWORK_PASSPHRASE,
      })
        .addOperation(
          contract.call(
            'set_message',
            StellarSdk.nativeToScVal(newMessage, { type: 'string' })
          )
        )
        .setTimeout(30)
        .build();

      setStatus('Simulating transaction...');
      const preparedTx = await server.prepareTransaction(tx);

      let signedTx;

      if (useDemo && secretKey) {
        // Demo mode: sign locally with secret key
        setStatus('Signing with local key...');
        const keypair = StellarSdk.Keypair.fromSecret(secretKey);
        preparedTx.sign(keypair);
        signedTx = preparedTx;
      } else {
        // Freighter mode
        setStatus('Waiting for your signature in Freighter...');
        const freighterApi = await import('@stellar/freighter-api');
        const { signedTxXdr } = await freighterApi.signTransaction(
          preparedTx.toXDR(),
          { networkPassphrase: NETWORK_PASSPHRASE }
        );
        signedTx = StellarSdk.TransactionBuilder.fromXDR(signedTxXdr, NETWORK_PASSPHRASE);
      }

      setStatus('Submitting to the blockchain...');
      const sendResponse = await server.sendTransaction(signedTx);

      if (sendResponse.status === 'ERROR') {
        throw new Error('Transaction submission failed');
      }

      setStatus('Waiting for confirmation...');
      let getResponse = await server.getTransaction(sendResponse.hash);
      let attempts = 0;
      while (getResponse.status === 'NOT_FOUND' && attempts < 20) {
        await new Promise(r => setTimeout(r, 1000));
        getResponse = await server.getTransaction(sendResponse.hash);
        attempts++;
      }

      if (getResponse.status === 'SUCCESS') {
        setStatus('✅ Message updated successfully!');
        setNewMessage('');
        fetchCurrentMessage();
      } else {
        throw new Error('Transaction failed on-chain');
      }
    } catch (err) {
      console.error(err);
      setStatus('❌ Error: ' + (err.message || 'Transaction failed'));
    }

    setLoading(false);
    setTimeout(() => setStatus(''), 6000);
  };

  // ─── Render ────────────────────────────────────────────────
  return (
    <div className="app-container">
      <div className="glass-card">
        {/* Header */}
        <header>
          <h1>✉ Message Board</h1>
          <p className="subtitle">Powered by Stellar Soroban</p>
        </header>

        {/* Wallet Connection */}
        <section className="wallet-section">
          <div className="wallet-info">
            <p>Wallet Status</p>
            {pubKey ? (
              <span className="pubkey">
                {pubKey.slice(0, 5)}...{pubKey.slice(-5)}
                {useDemo && <span style={{marginLeft: 8, color: '#ffb703', fontSize: '0.8rem'}}>(Demo)</span>}
              </span>
            ) : (
              <span className="pubkey" style={{ color: '#adb5bd', background: 'rgba(255,255,255,0.05)' }}>
                Not Connected
              </span>
            )}
          </div>
          {!pubKey && (
            <button id="connect-btn" onClick={connectFreighter}>
              Connect Freighter
            </button>
          )}
          {pubKey && (
            <button disabled>✓ Connected</button>
          )}
        </section>

        {/* Demo Mode Section */}
        {!pubKey && (
          <section className="demo-section">
            <p className="demo-label">— or use Demo Mode —</p>
            <p className="demo-hint">
              Paste your Stellar <strong>Secret Key</strong> (starts with "S") from your local account.
              <br />
              <span style={{fontSize: '0.8rem', color: '#adb5bd'}}>
                Run <code>stellar keys show alice8001</code> in your terminal to get it.
              </span>
            </p>
            <div className="demo-input-row">
              <input
                id="secret-key-input"
                type="password"
                placeholder="S..."
                value={demoKeyInput}
                onChange={(e) => setDemoKeyInput(e.target.value)}
              />
              <button onClick={connectDemo}>Connect</button>
            </div>
          </section>
        )}

        {/* Current Message Display */}
        <section className="message-display">
          <p className="message-label">Current Message On-Chain</p>
          {fetching ? (
            <div className="loader" />
          ) : (
            <p className="message-text">"{message}"</p>
          )}
          <button
            className="refresh-btn"
            onClick={fetchCurrentMessage}
            style={{ marginTop: '1rem', fontSize: '0.85rem', padding: '0.5rem 1rem' }}
          >
            ↻ Refresh
          </button>
        </section>

        {/* Set New Message */}
        <form className="input-section" onSubmit={handleSetMessage}>
          <input
            id="message-input"
            type="text"
            placeholder="Write a new message..."
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            disabled={loading}
          />
          <button id="update-btn" type="submit" disabled={loading || !pubKey}>
            {loading ? <span className="loader" /> : 'Update'}
          </button>
        </form>

        {status && <p className="status-msg">{status}</p>}
      </div>
    </div>
  );
}

export default App;
