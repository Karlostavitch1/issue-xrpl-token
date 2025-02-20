// State management
let currentStep = 1;
const state = {
    network: null,
    issuingWallet: null,
    operatingWallet: null,
    tokenConfig: null
};

// Temporary seed storage with auto-cleanup
const tempSeedStore = {
    _seeds: new Map(),
    _timeouts: new Map(),
    
    // Store seed temporarily with auto-cleanup after 5 minutes
    storeSeed: function(walletAddress, seed) {
        if (this._timeouts.has(walletAddress)) {
            clearTimeout(this._timeouts.get(walletAddress));
        }
        
        // Encrypt seed in memory
        const encryptedSeed = this._encryptSeed(seed);
        this._seeds.set(walletAddress, encryptedSeed);
        
        // Set cleanup timeout
        const timeout = setTimeout(() => {
            this.removeSeed(walletAddress);
        }, 5 * 60 * 1000); // 5 minutes
        
        this._timeouts.set(walletAddress, timeout);
    },
    
    getSeed: function(walletAddress) {
        const encryptedSeed = this._seeds.get(walletAddress);
        if (!encryptedSeed) return null;
        return this._decryptSeed(encryptedSeed);
    },
    
    removeSeed: function(walletAddress) {
        this._seeds.delete(walletAddress);
        if (this._timeouts.has(walletAddress)) {
            clearTimeout(this._timeouts.get(walletAddress));
            this._timeouts.delete(walletAddress);
        }
    },
    
    _encryptSeed: function(seed) {
        // Simple XOR encryption with a random key
        const key = crypto.getRandomValues(new Uint8Array(seed.length));
        const encrypted = new Uint8Array(seed.length);
        for (let i = 0; i < seed.length; i++) {
            encrypted[i] = seed.charCodeAt(i) ^ key[i];
        }
        return { encrypted, key };
    },
    
    _decryptSeed: function(encryptedData) {
        const { encrypted, key } = encryptedData;
        let decrypted = '';
        for (let i = 0; i < encrypted.length; i++) {
            decrypted += String.fromCharCode(encrypted[i] ^ key[i]);
        }
        return decrypted;
    },
    
    clear: function() {
        this._seeds.clear();
        this._timeouts.forEach(clearTimeout);
        this._timeouts.clear();
    }
};

// Network configuration (matching main process config)
const networks = {
    test: 'wss://s.altnet.rippletest.net:51233',
    main: 'wss://xrplcluster.com'
};

const explorerUrls = {
    test: 'https://testnet.xrpl.org',
    main: 'https://livenet.xrpl.org'
};

// DOM Elements
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const createBtn = document.getElementById('createBtn');
const steps = document.querySelectorAll('.step');
const stepContents = document.querySelectorAll('.step-content');

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    // Network selection listeners
    document.querySelectorAll('input[name="network"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            const network = e.target.dataset.network;
            selectNetwork(network);
        });
    });

    // Wallet selection listeners - use event delegation for dynamic content
    document.addEventListener('change', (e) => {
        // Handle wallet type selection (new/existing)
        if (e.target.matches('input[name="issuing-wallet"], input[name="operating-wallet"]')) {
            console.log('Wallet radio changed:', e.target.value, e.target.dataset.walletType);
            const walletType = e.target.dataset.walletType;
            if (walletType) {
                handleWalletSelection(walletType);
            }
        }
    });

    prevBtn.addEventListener('click', () => navigateStep(-1));
    nextBtn.addEventListener('click', () => navigateStep(1));
    createBtn.addEventListener('click', createToken);
});

// Network Selection
async function selectNetwork(network) {
    console.log('Network selected:', network);
    state.network = network;
    
    document.querySelector('.mainnet-warning').classList.toggle('hidden', network !== 'main');
    validateStep();
}

// Wallet Management
async function handleWalletSelection(walletType) {
    console.log('handleWalletSelection called with:', walletType);
    
    const isIssuing = walletType.includes('issuing');
    const detailsId = isIssuing ? 'issuing-wallet-details' : 'operating-wallet-details';
    const walletDetails = document.getElementById(detailsId);
    
    console.log('Wallet details element:', walletDetails);
    
    // Clear any existing wallet data
    if (isIssuing) {
        if (state.issuingWallet?.address) {
            tempSeedStore.removeSeed(state.issuingWallet.address);
        }
        state.issuingWallet = null;
    } else {
        if (state.operatingWallet?.address) {
            tempSeedStore.removeSeed(state.operatingWallet.address);
        }
        state.operatingWallet = null;
    }

    // First, ensure the wallet details container is visible
    walletDetails.classList.remove('hidden');
    
    // Then clear the content
    walletDetails.innerHTML = '';
    
    if (walletType.startsWith('new-')) {
        console.log('Creating new wallet...');
        const wallet = await createNewWallet();
        
        // Store only address in state, seed in temporary storage
        if (isIssuing) {
            state.issuingWallet = { address: wallet.address, isNewWallet: true };
            tempSeedStore.storeSeed(wallet.address, wallet.seed);
        } else {
            state.operatingWallet = { address: wallet.address, isNewWallet: true };
            tempSeedStore.storeSeed(wallet.address, wallet.seed);
        }
        
        displayWalletInfo(wallet, isIssuing);
    } else {
        console.log('Showing existing wallet form...');
        showExistingWalletForm(isIssuing);
    }
    
    validateStep();
}

async function createNewWallet() {
    const wallet = await window.api.createWallet();
    return {
        address: wallet.address,
        seed: wallet.seed,
        publicKey: wallet.publicKey,
        privateKey: wallet.privateKey,
        mnemonic: wallet.mnemonic
    };
}

function displayWalletInfo(wallet, isIssuing) {
    const detailsId = isIssuing ? 'issuing-wallet-details' : 'operating-wallet-details';
    const walletDetails = document.getElementById(detailsId);
    const type = isIssuing ? 'Issuing' : 'Operating';
    
    // Create a secure display container
    const secureDisplay = document.createElement('div');
    secureDisplay.className = 'mnemonic-display';
    
    // Add copy-to-clipboard functionality with secure handling
    const createSecureField = (label, value, isSecret = true) => {
        const field = document.createElement('div');
        field.className = 'recovery-section';
        
        const labelElem = document.createElement('p');
        labelElem.innerHTML = `<strong>${label}:</strong>`;
        field.appendChild(labelElem);
        
        const valueContainer = document.createElement('div');
        valueContainer.className = isSecret ? 'secure-value hidden' : 'value';
        valueContainer.textContent = value;
        
        if (isSecret && !wallet.isExistingWallet) {
            const toggleBtn = document.createElement('button');
            toggleBtn.className = 'toggle-visibility-btn';
            toggleBtn.textContent = 'Show';
            toggleBtn.onclick = () => {
                if (valueContainer.classList.contains('hidden')) {
                    valueContainer.classList.remove('hidden');
                    toggleBtn.textContent = 'Hide';
                    // Auto-hide after 30 seconds
                    setTimeout(() => {
                        valueContainer.classList.add('hidden');
                        toggleBtn.textContent = 'Show';
                    }, 30000);
                } else {
                    valueContainer.classList.add('hidden');
                    toggleBtn.textContent = 'Show';
                }
            };
            field.appendChild(toggleBtn);
        }
        
        field.appendChild(valueContainer);
        return field;
    };
    
    walletDetails.innerHTML = `
        <h3>${type} Wallet ${wallet.isExistingWallet ? 'Validated' : 'Created'}</h3>
        ${createSecureField('Address', wallet.address, false).outerHTML}
        ${wallet.balance ? `<p class="balance-info sufficient"><strong>Current Balance:</strong> ${wallet.balance} XRP</p>` : ''}
    `;
    
    // Only show the warning and recovery details for new wallets
    if (!wallet.isExistingWallet) {
        walletDetails.innerHTML += `
            <div class="warning">
                ⚠️ IMPORTANT: Save your account seed in a secure location. It will not be shown again.
                The values will be automatically hidden after 30 seconds.
            </div>
        `;
        
        if (wallet.seed) {
            walletDetails.appendChild(createSecureField('Account Seed', wallet.seed));
        }
        if (wallet.mnemonic) {
            walletDetails.appendChild(createSecureField('Backup Recovery (12 words)', wallet.mnemonic));
        }
    }
}

function showExistingWalletForm(isIssuing) {
    console.log('Showing existing wallet form for:', isIssuing ? 'issuing' : 'operating', 'wallet');
    
    const detailsId = isIssuing ? 'issuing-wallet-details' : 'operating-wallet-details';
    const walletDetails = document.getElementById(detailsId);
    const type = isIssuing ? 'Issuing' : 'Operating';
    const inputId = `${isIssuing ? 'issuing' : 'operating'}`;
    
    // Ensure the wallet details container is visible
    walletDetails.classList.remove('hidden');
    
    walletDetails.innerHTML = `
        <h3>Enter ${type} Wallet Details</h3>
        <div class="form-group">
            <div class="input-container" id="${inputId}-seed-container">
                <label for="${inputId}-seed">Account Seed:</label>
                <input type="text" id="${inputId}-seed" placeholder="Enter your account seed">
                <div class="validation-message hidden"></div>
            </div>
            
            <button class="submit-btn" type="button" disabled>Submit</button>
        </div>
    `;

    // Get references to input and button
    const seedInput = document.getElementById(`${inputId}-seed`);
    const submitBtn = walletDetails.querySelector('.submit-btn');

    // Add input validation listener
    seedInput.addEventListener('input', () => validateWalletSeed(seedInput, isIssuing));

    // Add submit button listener
    submitBtn.addEventListener('click', () => {
        submitExistingWallet(isIssuing, 'seed');
    });
}

function validateWalletSeed(input, isIssuing) {
    const validationMessage = input.parentElement.querySelector('.validation-message');
    const submitBtn = input.parentElement.parentElement.querySelector('.submit-btn');
    
    // Remove any existing validation classes
    input.classList.remove('invalid-input', 'valid-input');
    validationMessage.classList.remove('error-message', 'success-message');
    validationMessage.classList.add('hidden');
    
    if (!input.value) {
        submitBtn.disabled = true;
        return;
    }

    // Basic format validation (this is a simple check, the real validation happens in the main process)
    const isValidFormat = /^[a-zA-Z0-9]{20,}$/.test(input.value);
    
    if (!isValidFormat) {
        input.classList.add('invalid-input');
        validationMessage.textContent = "Invalid account seed format. Account seeds should be at least 20 characters long and contain only letters and numbers.";
        validationMessage.classList.remove('hidden');
        validationMessage.classList.add('error-message');
        submitBtn.disabled = true;
    } else {
        submitBtn.disabled = false;
    }
}

function submitExistingWallet(isIssuing, type = 'seed') {
    console.log('submitExistingWallet called:', { isIssuing, type });
    
    const inputId = `${isIssuing ? 'issuing' : 'operating'}-seed`;
    const input = document.getElementById(inputId);
    console.log('Input element:', input);
    console.log('Input value:', input.value);
    
    const container = input.closest('.form-group');
    const validationMessage = input.nextElementSibling;
    const submitBtn = container.querySelector('.submit-btn');
    
    submitBtn.disabled = true;
    submitBtn.textContent = 'Validating...';
    
    // Validate seed format
    const isValidFormat = /^[a-zA-Z0-9]{20,}$/.test(input.value);
    console.log('Seed validation:', { isValidFormat, value: input.value });
    
    if (!isValidFormat) {
        console.log('Format validation failed');
        input.classList.remove('valid-input');
        input.classList.add('invalid-input');
        validationMessage.textContent = "Invalid account seed format. Account seeds should be at least 20 characters long and contain only letters and numbers.";
        validationMessage.classList.remove('hidden', 'success-message');
        validationMessage.classList.add('error-message');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit';
        return;
    }

    console.log('Calling validateWalletSeed with:', {
        network: networks[state.network],
        seed: input.value
    });

    // Validate against XRPL network
    window.api.validateWalletSeed({
        network: networks[state.network],
        seed: input.value
    })
    .then(result => {
        console.log('Validation result:', result);
        if (result.success) {
            // Success - show validation success and wallet info
            input.classList.remove('invalid-input');
            input.classList.add('valid-input');
            validationMessage.textContent = `Wallet validated successfully! Balance: ${result.balance} XRP`;
            validationMessage.classList.remove('hidden', 'error-message');
            validationMessage.classList.add('success-message');
            
            // Store wallet info
            if (isIssuing) {
                state.issuingWallet = { address: result.address, isNewWallet: false };
                tempSeedStore.storeSeed(result.address, result.seed);
            } else {
                state.operatingWallet = { address: result.address, isNewWallet: false };
                tempSeedStore.storeSeed(result.address, result.seed);
            }
            
            // Show the wallet info with the seed hidden
            const walletInfo = {
                address: result.address,
                seed: hashSensitiveData(result.seed),
                balance: result.balance,
                isExistingWallet: true
            };
            displayWalletInfo(walletInfo, isIssuing);
            validateStep();
        } else {
            handleValidationError(input, validationMessage, isIssuing, result.error);
        }
    })
    .catch(error => {
        console.error('Validation error:', error);
        handleValidationError(input, validationMessage, isIssuing, "Network error while validating wallet. Please try again.");
    })
    .finally(() => {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit';
    });
}

function handleValidationError(input, validationMessage, isIssuing, errorMessage) {
    input.classList.remove('valid-input');
    input.classList.add('invalid-input');
    validationMessage.textContent = errorMessage;
    validationMessage.classList.remove('hidden', 'success-message');
    validationMessage.classList.add('error-message');
    
    // Reset wallet state
    if (isIssuing) {
        state.issuingWallet = null;
    } else {
        state.operatingWallet = null;
    }
    validateStep();
}

// Token Creation
async function createToken() {
    try {
        addDebugLog('Starting token creation process...', 'info');
        addDebugLog(`Network: ${networks[state.network]}`, 'info');
        addDebugLog(`Issuing Wallet: ${hashSensitiveData(state.issuingWallet.address)}`, 'info');
        addDebugLog(`Operating Wallet: ${hashSensitiveData(state.operatingWallet.address)}`, 'info');
        addDebugLog(`Token: ${state.tokenConfig.currency}, Amount: ${state.tokenConfig.amount}`, 'info');

        // Get seeds from temporary storage
        const issuingSeed = tempSeedStore.getSeed(state.issuingWallet.address);
        const operatingSeed = tempSeedStore.getSeed(state.operatingWallet.address);

        if (!issuingSeed || !operatingSeed) {
            throw new Error('Wallet credentials expired. Please restart the process.');
        }

        const result = await window.api.createToken({
            network: networks[state.network],
            issuingWallet: { ...state.issuingWallet, seed: issuingSeed },
            operatingWallet: { ...state.operatingWallet, seed: operatingSeed },
            tokenConfig: state.tokenConfig
        });

        if (result.success) {
            console.log("Token creation successful:", result);
            
            // Log TrustSet transaction with secure link
            if (result.trust_result && result.trust_result.result && result.trust_result.result.hash) {
                const trustSetHash = result.trust_result.result.hash;
                const trustSetLink = getExplorerLink(networks[state.network], trustSetHash);
                addDebugLog('TrustSet transaction submitted successfully', 'success');
                addDebugLog(`View TrustSet transaction: <a href="${trustSetLink}" target="_blank" rel="noopener noreferrer">${trustSetLink}</a>`, 'info');
            }

            // Log Payment transaction with secure link
            if (result.issue_result && result.issue_result.result && result.issue_result.result.hash) {
                const issueHash = result.issue_result.result.hash;
                const issueLink = getExplorerLink(networks[state.network], issueHash);
                addDebugLog('Token issuance transaction submitted successfully', 'success');
                addDebugLog(`View issuance transaction: <a href="${issueLink}" target="_blank" rel="noopener noreferrer">${issueLink}</a>`, 'info');
            }

            addDebugLog('Token creation process complete!', 'success');
            alert('Token created successfully! Check the process log for transaction details.');
            
            // Only clear seeds after successful token creation
            tempSeedStore.clear();
        } else {
            console.error('Error creating token:', result.error);
            addDebugLog('Token creation failed: ' + result.error, 'error');
            alert('Error creating token: ' + result.error);
        }
    } catch (error) {
        console.error('Error creating token:', error);
        addDebugLog('Error during token creation: ' + error.message, 'error');
        alert('Error creating token. Please check the process log for details.');
    }
}

// Helper function to get explorer link based on network
function getExplorerLink(network, hash) {
    // Convert network URL to network type
    const networkType = Object.entries(networks).find(([type, url]) => url === network)?.[0] || 'test';
    const baseUrl = explorerUrls[networkType];
    
    // Log the values for debugging
    console.log('Network:', network);
    console.log('Network Type:', networkType);
    console.log('Base URL:', baseUrl);
    console.log('Hash:', hash);
    
    const link = `${baseUrl}/transactions/${hash}`;
    console.log('Generated Link:', link);
    return link;
}

// Helper function to hash sensitive data
function hashSensitiveData(data) {
    if (!data) return '';
    // Only show first 6 and last 4 characters, replace rest with asterisks
    const visibleStart = data.substring(0, 6);
    const visibleEnd = data.substring(data.length - 4);
    const hiddenLength = data.length - 10;
    return `${visibleStart}${'*'.repeat(hiddenLength)}${visibleEnd}`;
}

// Update the debug log function to support HTML content and hash sensitive data
function addDebugLog(message, type = 'info') {
    const debugLog = document.getElementById('debug-log');
    if (debugLog) {
        const timestamp = new Date().toLocaleTimeString();
        const logEntry = document.createElement('div');
        logEntry.className = `log-entry log-${type}`;
        
        // Hash sensitive data in the message if it contains wallet seeds
        let safeMessage = message;
        if (message.includes('seed') || message.includes('Seed')) {
            const seedRegex = /([a-zA-Z0-9]{20,})/g;
            safeMessage = message.replace(seedRegex, match => hashSensitiveData(match));
        }
        
        // Format network URLs to be more readable
        if (message.includes(networks.test)) {
            safeMessage = message.replace(networks.test, 'XRPL Testnet');
        } else if (message.includes(networks.main)) {
            safeMessage = message.replace(networks.main, 'XRPL Mainnet');
        }
        
        logEntry.innerHTML = `<span class="log-time">[${timestamp}]</span> ${safeMessage}`;
        debugLog.appendChild(logEntry);
        debugLog.scrollTop = debugLog.scrollHeight;
    }
}

// Navigation
function navigateStep(direction) {
    const newStep = currentStep + direction;
    console.log('Attempting to navigate to step:', newStep);
    console.log('Current state:', state);
    
    // Validate current step before allowing navigation
    if (!validateCurrentStep()) {
        console.log('Cannot navigate: current step validation failed');
        return;
    }
    
    // Check if we're moving away from the wallet creation step (step 2)
    if (currentStep === 2 && direction === 1) {
        // Check if at least one new wallet was created
        const hasNewWallet = (state.issuingWallet?.isNewWallet || state.operatingWallet?.isNewWallet);
        
        if (hasNewWallet) {
            showConfirmationDialog(() => {
                performStepNavigation(newStep);
            });
            return;
        }
    }
    
    performStepNavigation(newStep);
}

// New function to show the custom confirmation dialog
function showConfirmationDialog(onConfirm) {
    const modal = document.getElementById('confirmationModal');
    const confirmBtn = document.getElementById('modalConfirmBtn');
    const cancelBtn = document.getElementById('modalCancelBtn');
    
    modal.classList.remove('hidden');
    
    const handleConfirm = () => {
        modal.classList.add('hidden');
        confirmBtn.removeEventListener('click', handleConfirm);
        cancelBtn.removeEventListener('click', handleCancel);
        onConfirm();
    };
    
    const handleCancel = () => {
        modal.classList.add('hidden');
        confirmBtn.removeEventListener('click', handleConfirm);
        cancelBtn.removeEventListener('click', handleCancel);
    };
    
    confirmBtn.addEventListener('click', handleConfirm);
    cancelBtn.addEventListener('click', handleCancel);
}

// New function to handle the actual step navigation
function performStepNavigation(newStep) {
    if (newStep < 1 || newStep > 4) return;
    
    // First, remove active class from all steps and contents
    steps.forEach(step => step.classList.remove('active'));
    stepContents.forEach(content => {
        content.classList.remove('active');
        content.style.display = 'none';
    });
    
    // Update current step
    currentStep = newStep;
    
    // Then, add active class to current step and show its content
    const currentStepElement = document.querySelector(`[data-step="${currentStep}"]`);
    const currentContent = document.getElementById(`step${currentStep}`);
    
    if (currentStepElement) {
        currentStepElement.classList.add('active');
    }
    
    if (currentContent) {
        currentContent.classList.add('active');
        currentContent.style.display = 'block';
    }
    
    // Handle step-specific UI updates
    if (currentStep === 4) {
        try {
            displayReviewStep();
            nextBtn.classList.add('hidden');
            createBtn.classList.remove('hidden');
        } catch (error) {
            console.error('Error displaying review step:', error);
            return;
        }
    } else {
        nextBtn.classList.remove('hidden');
        createBtn.classList.add('hidden');
    }
    
    // Update step indicators
    steps.forEach((step, index) => {
        if (index + 1 < currentStep) {
            step.classList.add('completed');
        } else {
            step.classList.remove('completed');
        }
    });
    
    // Handle token step initialization
    if (currentStep === 3) {
        initializeTokenStep();
    }
    
    prevBtn.disabled = currentStep === 1;
    validateStep();
    
    // Remove the premature seed storage clearing
    // We'll now clear it only after successful token creation or when restarting the process
}

// New function to initialize token step
function initializeTokenStep() {
    const currencyCode = document.getElementById('currency-code');
    const tokenAmount = document.getElementById('token-amount');
    const tokenDecimals = document.getElementById('token-decimals');
    
    // Remove any existing event listeners
    const events = ['input', 'keyup', 'change'];
    [currencyCode, tokenAmount, tokenDecimals].forEach(input => {
        if (input) {
            events.forEach(event => {
                input.removeEventListener(event, handleTokenInputChange);
            });
        }
    });
    
    // Add new event listeners
    [currencyCode, tokenAmount, tokenDecimals].forEach(input => {
        if (input) {
            events.forEach(event => {
                input.addEventListener(event, handleTokenInputChange);
            });
            // Reset the input to ensure it's interactive
            input.disabled = false;
            input.readOnly = false;
        }
    });

    // Add specific validation feedback for currency code
    if (currencyCode) {
        currencyCode.addEventListener('input', validateCurrencyCodeInput);
    }
}

function validateCurrencyCodeInput(event) {
    const input = event.target;
    const value = input.value;
    const validationMessage = document.getElementById('currency-code-validation');
    
    // Remove any existing validation classes
    input.classList.remove('invalid-input', 'valid-input');
    
    if (value) {
        const isValidLength = value.length === 3;
        const hasOnlyLetters = /^[A-Za-z]*$/.test(value);
        
        if (!isValidLength || !hasOnlyLetters) {
            input.classList.add('invalid-input');
            let message = [];
            
            if (!isValidLength) {
                message.push("Currency code must be exactly 3 characters");
            }
            if (!hasOnlyLetters) {
                message.push("Only letters (A-Z) are allowed");
            }
            
            validationMessage.textContent = message.join(". ");
            validationMessage.classList.remove('hidden');
            validationMessage.classList.add('error-message');
        } else {
            input.classList.add('valid-input');
            validationMessage.textContent = "Valid currency code format";
            validationMessage.classList.remove('hidden', 'error-message');
            validationMessage.classList.add('success-message');
        }
    } else {
        validationMessage.classList.add('hidden');
    }
    
    validateStep();
}

function validateCurrentStep() {
    let isValid = false;
    console.log('Validating current step:', currentStep);
    
    switch (currentStep) {
        case 1:
            isValid = !!state.network;
            console.log('Network validation:', { isValid, network: state.network });
            break;
        case 2:
            isValid = validateWalletStep();
            break;
        case 3:
            isValid = validateTokenStep();
            break;
        case 4:
            isValid = true;
            break;
    }
    
    console.log('Step validation result:', isValid);
    return isValid;
}

function validateWalletStep() {
    console.log('Validating wallet step');
    console.log('Issuing wallet:', state.issuingWallet);
    console.log('Operating wallet:', state.operatingWallet);
    
    // First check if both wallets exist and have addresses
    const hasWallets = state.issuingWallet && state.operatingWallet &&
                      state.issuingWallet.address && state.operatingWallet.address;
    
    if (!hasWallets) {
        return false;
    }

    // Check if wallets are unique
    if (state.issuingWallet.address === state.operatingWallet.address) {
        // Display error message for non-unique wallets
        const issuingDetails = document.getElementById('issuing-wallet-details');
        const operatingDetails = document.getElementById('operating-wallet-details');
        
        // Create or update error message elements
        let issuingError = issuingDetails.querySelector('.wallet-error');
        let operatingError = operatingDetails.querySelector('.wallet-error');
        
        if (!issuingError) {
            issuingError = document.createElement('div');
            issuingError.className = 'wallet-error error-message';
            issuingDetails.appendChild(issuingError);
        }
        
        if (!operatingError) {
            operatingError = document.createElement('div');
            operatingError.className = 'wallet-error error-message';
            operatingDetails.appendChild(operatingError);
        }
        
        const errorMessage = 'Issuing and Operating wallets must be different';
        issuingError.textContent = errorMessage;
        operatingError.textContent = errorMessage;
        
        return false;
    }
    
    // Clear any existing error messages if wallets are unique
    const errorMessages = document.querySelectorAll('.wallet-error');
    errorMessages.forEach(error => error.remove());
    
    return true;
}

function validateTokenStep() {
    const currencyCode = document.getElementById('currency-code')?.value;
    const amount = document.getElementById('token-amount')?.value;
    const decimals = document.getElementById('token-decimals')?.value || '6';
    
    // Validate currency code (exactly 3 alphabetical characters)
    const isValidCurrencyCode = /^[A-Za-z]{3}$/.test(currencyCode);
    
    // Validate amount (positive number)
    const isValidAmount = amount && !isNaN(amount) && parseFloat(amount) > 0;
    
    // Validate decimals (0-15)
    const isValidDecimals = decimals && !isNaN(decimals) && 
                           parseInt(decimals) >= 0 && parseInt(decimals) <= 15;
    
    if (isValidCurrencyCode && isValidAmount && isValidDecimals) {
        state.tokenConfig = {
            currency: currencyCode.toUpperCase(),
            amount: amount,
            decimals: decimals
        };
        return true;
    }
    return false;
}

// Update the displayReviewStep function to include balance checking
function displayReviewStep() {
    if (!state.network || !state.issuingWallet || !state.operatingWallet || !state.tokenConfig) {
        console.error('Cannot display review: missing required state', state);
        throw new Error('Missing required configuration');
    }
    
    const reviewContent = document.getElementById('review-content');
    reviewContent.innerHTML = `
        <div class="review-item">
            <h3>Network</h3>
            <p>${state.network === 'test' ? 'Testnet' : 'Mainnet'}</p>
        </div>
        <div class="review-item">
            <h3>Issuing Wallet</h3>
            <p>${state.issuingWallet.address}</p>
        </div>
        <div class="review-item">
            <h3>Operating Wallet</h3>
            <p>${state.operatingWallet.address}</p>
        </div>
        <div class="review-item">
            <h3>Token Configuration</h3>
            <p>Currency Code: ${state.tokenConfig.currency}</p>
            <p>Amount: ${state.tokenConfig.amount}</p>
            <p>Decimals: ${state.tokenConfig.decimals}</p>
        </div>
        <div class="review-item debug-output">
            <h3>Process Log</h3>
            <div id="debug-log" class="debug-log"></div>
        </div>
    `;

    // Check balances after displaying the review content
    checkAndDisplayBalances();
}

function validateStep() {
    const isValid = validateCurrentStep();
    nextBtn.disabled = !isValid;
    createBtn.disabled = !isValid;
    return isValid;
}

// Create a function to handle input changes
function handleTokenInputChange(event) {
    console.log('Token input changed:', event.target.id, event.type);
    validateStep();
}

// Initialize UI
updateStepUI(); 

// Make functions globally available for event handlers
window.refreshBalances = refreshBalances;
window.fundFromFaucet = fundFromFaucet;
window.submitExistingWallet = submitExistingWallet;

// Define the functions separately first
async function refreshBalances() {
    addDebugLog('Refreshing wallet balances...');
    await checkAndDisplayBalances();
    addDebugLog('Balance refresh complete', 'success');
}

async function fundFromFaucet() {
    console.log('Faucet funding started');
    addDebugLog('Starting faucet funding process...', 'info');
    
    try {
        if (!state.network || !state.issuingWallet || !state.operatingWallet) {
            throw new Error('Missing wallet information');
        }

        // Get seeds from temporary storage
        const issuingSeed = tempSeedStore.getSeed(state.issuingWallet.address);
        const operatingSeed = tempSeedStore.getSeed(state.operatingWallet.address);

        if (!issuingSeed || !operatingSeed) {
            throw new Error('Wallet credentials expired. Please restart the process.');
        }

        addDebugLog(`Requesting funds for wallets on ${state.network === networks.test ? 'Testnet' : 'Mainnet'}...`, 'info');
        const fundingResult = await window.api.fundFromFaucet({
            network: networks[state.network],
            issuingWallet: { ...state.issuingWallet, seed: issuingSeed },
            operatingWallet: { ...state.operatingWallet, seed: operatingSeed }
        });

        console.log('Funding result:', fundingResult);

        if (fundingResult.success) {
            addDebugLog('Faucet funding request successful!', 'success');
            
            if (fundingResult.issuing_result && fundingResult.issuing_result.result && fundingResult.issuing_result.result.hash) {
                addDebugLog('Issuing wallet funded successfully', 'success');
                const issueLink = getExplorerLink(networks[state.network], fundingResult.issuing_result.result.hash);
                addDebugLog(`View issuing wallet funding transaction: <a href="${issueLink}" target="_blank" rel="noopener noreferrer">${issueLink}</a>`, 'info');
            }
            
            if (fundingResult.operating_result && fundingResult.operating_result.result && fundingResult.operating_result.result.hash) {
                addDebugLog('Operating wallet funded successfully', 'success');
                const opLink = getExplorerLink(networks[state.network], fundingResult.operating_result.result.hash);
                addDebugLog(`View operating wallet funding transaction: <a href="${opLink}" target="_blank" rel="noopener noreferrer">${opLink}</a>`, 'info');
            }
            
            addDebugLog('Waiting for funding transactions to be processed...', 'info');
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            addDebugLog('Refreshing balances to verify funding...', 'info');
            await checkAndDisplayBalances();
            addDebugLog('Faucet funding process complete!', 'success');
        } else {
            console.error('Funding failed:', fundingResult.error);
            addDebugLog('Faucet funding failed: ' + fundingResult.error, 'error');
            if (fundingResult.error && fundingResult.error.includes('Rate limit')) {
                addDebugLog('Note: Testnet faucet has a rate limit. Please wait a few seconds before trying again.', 'warning');
            }
            alert('Error funding wallets: ' + (fundingResult.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error in fundFromFaucet:', error);
        addDebugLog('Error during faucet funding process:', 'error');
        addDebugLog(error.message, 'error');
        if (error.message.includes('connect')) {
            addDebugLog('Network connection issue detected. Please check your internet connection.', 'warning');
        }
        alert('Error funding wallets. Please check the process log for details.');
    }
}

// Update the checkAndDisplayBalances function to use direct function references
async function checkAndDisplayBalances() {
    try {
        addDebugLog('Checking wallet balances...');
        const balanceInfo = await window.api.checkWalletBalances({
            network: networks[state.network],
            issuingWallet: state.issuingWallet,
            operatingWallet: state.operatingWallet
        });

        if (balanceInfo.success) {
            const isIssuingFunded = balanceInfo.issuing_wallet.balance >= balanceInfo.issuing_wallet.required;
            const isOperatingFunded = balanceInfo.operating_wallet.balance >= balanceInfo.operating_wallet.required;
            
            addDebugLog(`Issuing Wallet Balance: ${balanceInfo.issuing_wallet.balance} XRP (Required: ${balanceInfo.issuing_wallet.required} XRP)`, isIssuingFunded ? 'success' : 'warning');
            addDebugLog(`Operating Wallet Balance: ${balanceInfo.operating_wallet.balance} XRP (Required: ${balanceInfo.operating_wallet.required} XRP)`, isOperatingFunded ? 'success' : 'warning');

            const balanceSection = document.createElement('div');
            balanceSection.className = 'review-item wallet-balances';
            
            balanceSection.innerHTML = `
                <h3>Wallet Balances</h3>
                <div class="balance-info ${isIssuingFunded ? 'sufficient' : 'insufficient'}">
                    <p><strong>Issuing Wallet:</strong> ${balanceInfo.issuing_wallet.balance} XRP</p>
                    <p>Required: ${balanceInfo.issuing_wallet.required} XRP</p>
                    ${!isIssuingFunded ? `<p class="warning">Please fund this wallet with at least ${balanceInfo.issuing_wallet.required} XRP</p>` : ''}
                </div>
                <div class="balance-info ${isOperatingFunded ? 'sufficient' : 'insufficient'}">
                    <p><strong>Operating Wallet:</strong> ${balanceInfo.operating_wallet.balance} XRP</p>
                    <p>Required: ${balanceInfo.operating_wallet.required} XRP</p>
                    ${!isOperatingFunded ? `<p class="warning">Please fund this wallet with at least ${balanceInfo.operating_wallet.required} XRP</p>` : ''}
                </div>
                ${(!isIssuingFunded || !isOperatingFunded) ? `
                    <div class="funding-instructions">
                        <p><strong>Funding Instructions:</strong></p>
                        ${balanceInfo.isTestnet ? `
                            <p>You are on testnet. Click the button below to fund your wallets from the faucet:</p>
                            <button class="submit-btn" type="button" id="faucetFundBtn">Fund from Testnet Faucet</button>
                        ` : `
                            <ol>
                                <li>Send the required XRP to each wallet address that needs funding</li>
                                <li>Wait for the transactions to be confirmed</li>
                                <li>Click the "Refresh Balances" button below</li>
                            </ol>
                        `}
                    </div>
                ` : ''}
                <button class="refresh-btn" type="button" id="refreshBalanceBtn">Refresh Balances</button>
            `;

            const existingBalanceSection = document.querySelector('.wallet-balances');
            if (existingBalanceSection) {
                existingBalanceSection.replaceWith(balanceSection);
            } else {
                document.getElementById('review-content').insertBefore(balanceSection, document.querySelector('.debug-output'));
            }

            // Add event listeners after adding the buttons to the DOM
            const refreshBtn = document.getElementById('refreshBalanceBtn');
            if (refreshBtn) {
                refreshBtn.addEventListener('click', refreshBalances);
            }

            const faucetBtn = document.getElementById('faucetFundBtn');
            if (faucetBtn) {
                faucetBtn.addEventListener('click', fundFromFaucet);
            }

            createBtn.disabled = !isIssuingFunded || !isOperatingFunded;
        } else {
            addDebugLog('Failed to check balances: ' + balanceInfo.error, 'error');
        }
    } catch (error) {
        console.error('Error checking balances:', error);
        addDebugLog('Error checking balances: ' + error.message, 'error');
        alert('Error checking wallet balances. Please try again.');
    }
} 