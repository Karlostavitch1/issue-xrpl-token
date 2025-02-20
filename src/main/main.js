const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const crypto = require('crypto');
const config = require('./config/config');
const xrpl = require('xrpl');

// Handle any uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});

function createWindow() {
    // Create the browser window with secure settings for the token creation wizard
    const win = new BrowserWindow({
        width: 1024,
        height: 768,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            enableRemoteModule: false,
            webSecurity: true,
            preload: path.join(__dirname, '../preload/preload.js')
        }
    });

    // Load the wizard interface
    const indexPath = path.join(__dirname, '../renderer/index.html');
    console.log('Loading token creation wizard interface from:', indexPath);
    
    win.loadFile(indexPath).catch(error => {
        console.error('Error loading wizard interface:', error);
    });
    
    // Enable DevTools in development mode
    if (process.env.NODE_ENV === 'development') {
        win.webContents.openDevTools();
    }

    // Error handling for window-related issues
    win.webContents.on('crashed', () => {
        console.error('Wizard interface crashed!');
    });

    win.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
        console.error('Failed to load wizard interface:', errorDescription);
    });

    // Set security headers
    win.webContents.session.webRequest.onHeadersReceived((details, callback) => {
        callback({
            responseHeaders: {
                ...details.responseHeaders,
                'Content-Security-Policy': ["default-src 'self'; script-src 'self'"]
            }
        });
    });

    return win;
}

// Initialize the application
app.whenReady().then(() => {
    console.log('Token Creation Wizard is starting...');
    const mainWindow = createWindow();
    
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
}).catch(error => {
    console.error('Error initializing token creation wizard:', error);
});

// IPC Handlers for Token Creation Process

// Step 1: Create new XRPL wallet
ipcMain.handle('create-wallet', async () => {
    const xrpl = require('xrpl');
    
    // Generate primary XRPL wallet
    const wallet = xrpl.Wallet.generate();
    
    return {
        address: wallet.address,
        seed: wallet.seed,
        publicKey: wallet.publicKey,
        privateKey: wallet.privateKey
    };
});

// Create wallet from seed
ipcMain.handle('create-wallet-from-seed', async (event, seed) => {
    try {
        const xrpl = require('xrpl');
        const wallet = xrpl.Wallet.fromSeed(seed);
        return {
            address: wallet.address,
            seed: wallet.seed,
            publicKey: wallet.publicKey,
            privateKey: wallet.privateKey
        };
    } catch (error) {
        throw new Error('Invalid wallet seed');
    }
});

// Step 2: Check wallet balances and funding requirements
ipcMain.handle('check-wallet-balances', async (event, data) => {
    try {
        const xrpl = require('xrpl');
        const client = new xrpl.Client(data.network);
        await client.connect();

        // Query current account information
        const issuing_info = await client.request({
            command: 'account_info',
            account: data.issuingWallet.address
        }).catch(e => ({ error: 'Account not found' }));

        const operating_info = await client.request({
            command: 'account_info',
            account: data.operatingWallet.address
        }).catch(e => ({ error: 'Account not found' }));

        await client.disconnect();

        return {
            success: true,
            issuing_wallet: {
                balance: issuing_info.error ? 0 : parseFloat(issuing_info.result.account_data.Balance) / 1000000,
                required: config.reserveRequirements.issuing
            },
            operating_wallet: {
                balance: operating_info.error ? 0 : parseFloat(operating_info.result.account_data.Balance) / 1000000,
                required: config.reserveRequirements.operating
            },
            isTestnet: data.network === config.networks.test
        };
    } catch (error) {
        console.error('Error checking wallet balances:', error);
        return { success: false, error: error.message };
    }
});

// Step 3: Create token by establishing trust line and issuing initial amount
ipcMain.handle('create-token', async (event, data) => {
    try {
        const xrpl = require('xrpl');
        const client = new xrpl.Client(data.network);
        await client.connect();
        
        const issuing_wallet = xrpl.Wallet.fromSeed(data.issuingWallet.seed);
        const operating_wallet = xrpl.Wallet.fromSeed(data.operatingWallet.seed);

        // Step 3a: Establish trust line from operating wallet to issuing wallet
        const trust_set_tx = {
            "TransactionType": "TrustSet",
            "Account": operating_wallet.address,
            "LimitAmount": {
                "currency": data.tokenConfig.currency,
                "issuer": issuing_wallet.address,
                "value": data.tokenConfig.amount.toString()
            }
        };
        
        console.log('Establishing trust line...');
        const trust_prepared = await client.autofill(trust_set_tx);
        const trust_signed = operating_wallet.sign(trust_prepared);
        const trust_result = await client.submitAndWait(trust_signed.tx_blob);
        console.log('Trust line established:', trust_result);

        // Allow trust line to be processed
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Step 3b: Issue initial token amount
        const issue_tx = {
            "TransactionType": "Payment",
            "Account": issuing_wallet.address,
            "Amount": {
                "currency": data.tokenConfig.currency,
                "value": data.tokenConfig.amount.toString(),
                "issuer": issuing_wallet.address
            },
            "Destination": operating_wallet.address
        };
        
        console.log('Issuing initial token amount...');
        const issue_prepared = await client.autofill(issue_tx);
        const issue_signed = issuing_wallet.sign(issue_prepared);
        const issue_result = await client.submitAndWait(issue_signed.tx_blob);
        console.log('Tokens issued:', issue_result);
        
        await client.disconnect();
        
        return { 
            success: true, 
            trust_result: {
                result: {
                    hash: trust_result.result.hash,
                    status: trust_result.result.meta.TransactionResult,
                    description: `TrustSet ${trust_result.result.meta.TransactionResult}`
                }
            },
            issue_result: {
                result: {
                    hash: issue_result.result.hash,
                    status: issue_result.result.meta.TransactionResult,
                    description: `Payment ${issue_result.result.meta.TransactionResult}`
                }
            }
        };
    } catch (error) {
        console.error('Error creating token:', error);
        return { success: false, error: error.message };
    }
});

// Testnet only: Fund wallets using faucet
ipcMain.handle('fund-from-faucet', async (event, data) => {
    try {
        const xrpl = require('xrpl');
        const client = new xrpl.Client(data.network);
        await client.connect();

        console.log('Requesting testnet funding...');
        
        // Check current balances
        const issuing_info = await client.request({
            command: 'account_info',
            account: data.issuingWallet.address
        }).catch(e => ({ error: 'Account not found' }));

        const operating_info = await client.request({
            command: 'account_info',
            account: data.operatingWallet.address
        }).catch(e => ({ error: 'Account not found' }));

        // Calculate required funding
        const issuing_balance = issuing_info.error ? 0 : parseFloat(issuing_info.result.account_data.Balance) / 1000000;
        const operating_balance = operating_info.error ? 0 : parseFloat(operating_info.result.account_data.Balance) / 1000000;

        // Initialize wallets
        const issuing_wallet = xrpl.Wallet.fromSeed(data.issuingWallet.seed);
        const operating_wallet = xrpl.Wallet.fromSeed(data.operatingWallet.seed);

        let issuing_fund_result = null;
        let operating_fund_result = null;

        // Fund issuing wallet if needed
        if (issuing_balance < config.reserveRequirements.issuing) {
            console.log('Funding issuing wallet...');
            const funding_amount = Math.ceil(config.reserveRequirements.issuing - issuing_balance);
            issuing_fund_result = await client.fundWallet(issuing_wallet, { 
                amount: funding_amount.toString()
            });
        }

        // Fund operating wallet if needed
        if (operating_balance < config.reserveRequirements.operating) {
            console.log('Funding operating wallet...');
            const funding_amount = Math.ceil(config.reserveRequirements.operating - operating_balance);
            operating_fund_result = await client.fundWallet(operating_wallet, {
                amount: funding_amount.toString()
            });
        }

        await client.disconnect();

        return {
            success: true,
            issuing_result: issuing_fund_result,
            operating_result: operating_fund_result,
            message: 'Testnet funding completed'
        };
    } catch (error) {
        console.error('Error requesting testnet funds:', error);
        return { success: false, error: error.message };
    }
});

// Add the validate wallet seed handler
ipcMain.handle('validate-wallet-seed', async (event, data) => {
    console.log('Validating wallet credentials:', {
        network: data.network,
        hasSeed: !!data.seed,
        hasPassphrase: !!data.passphrase
    });
    
    try {
        const client = new xrpl.Client(data.network);
        await client.connect();
        console.log('Connected to XRPL network');

        try {
            let wallet;
            if (data.seed) {
                console.log('Creating wallet from seed');
                wallet = xrpl.Wallet.fromSeed(data.seed);
            } else if (data.passphrase) {
                console.log('Creating wallet from passphrase');
                // Convert passphrase to seed using SHA-512
                const hash = crypto.createHash('sha512');
                hash.update(data.passphrase);
                const seed = hash.digest('hex').slice(0, 29).toUpperCase();
                console.log('Generated seed from passphrase');
                wallet = xrpl.Wallet.fromSeed(seed);
            } else {
                throw new Error('Either seed or passphrase must be provided');
            }
            
            console.log('Wallet created successfully:', {
                address: wallet.address,
                hasSeed: !!wallet.seed
            });
            
            // Get account info to verify the account exists and get its balance
            const accountInfo = await client.request({
                command: 'account_info',
                account: wallet.address
            });
            console.log('Account info retrieved:', {
                address: accountInfo.result.account_data.Account,
                balance: xrpl.dropsToXrp(accountInfo.result.account_data.Balance)
            });

            await client.disconnect();
            console.log('Disconnected from XRPL network');

            return {
                success: true,
                address: wallet.address,
                seed: wallet.seed,
                balance: xrpl.dropsToXrp(accountInfo.result.account_data.Balance)
            };
        } catch (error) {
            console.error('Wallet validation error:', error);
            await client.disconnect();
            
            // Check if it's an invalid seed/passphrase error
            if (error.message.includes('decode') || error.message.includes('checksum')) {
                return {
                    success: false,
                    error: data.seed ? 'Invalid wallet seed format' : 'Invalid recovery passphrase'
                };
            }
            
            // Check if account doesn't exist
            if (error.message.includes('actNotFound')) {
                return {
                    success: false,
                    error: 'Account not activated on the XRPL network'
                };
            }

            return {
                success: false,
                error: `Validation error: ${error.message}`
            };
        }
    } catch (error) {
        console.error('Network connection error:', error);
        return {
            success: false,
            error: 'Network connection error'
        };
    }
});

// Application lifecycle management
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// Error logging
app.on('render-process-gone', (event, webContents, details) => {
    console.error('Render process crashed:', details);
});

app.on('gpu-process-gone', (event, details) => {
    console.error('GPU process crashed:', details);
}); 