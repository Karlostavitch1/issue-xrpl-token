// XRPL Network Configuration
const networks = {
    test: 'wss://s.altnet.rippletest.net:51233',
    main: 'wss://xrplcluster.com'
};

// Explorer URLs for transaction viewing
const explorerUrls = {
    test: 'https://testnet.xrpl.org',
    main: 'https://livenet.xrpl.org'
};

// XRPL reserve requirements
const reserveRequirements = {
    issuing: 1.0,  // Base reserve for issuing wallet
    operating: 0.2 // Base reserve for operating wallet
};

module.exports = {
    networks,
    explorerUrls,
    reserveRequirements
}; 