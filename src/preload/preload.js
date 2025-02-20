const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld(
    'api', {
        createWallet: () => ipcRenderer.invoke('create-wallet'),
        createWalletFromSeed: (seed) => ipcRenderer.invoke('create-wallet-from-seed', seed),
        createToken: (data) => ipcRenderer.invoke('create-token', data),
        checkWalletBalances: (data) => ipcRenderer.invoke('check-wallet-balances', data),
        fundFromFaucet: (data) => ipcRenderer.invoke('fund-from-faucet', data),
        validateWalletSeed: (data) => {
            console.log('Validating wallet credentials:', {
                network: data.network,
                hasSeed: !!data.seed,
                hasPassphrase: !!data.passphrase
            });
            return ipcRenderer.invoke('validate-wallet-seed', data);
        }
    }
); 