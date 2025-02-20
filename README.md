# XRPL Token Creation Wizard

A desktop application for creating and managing tokens on the XRP Ledger (XRPL). This wizard provides a step-by-step interface for token creation, but please note that this is **experimental software** intended for developers and those who understand XRPL token mechanics.

## ⚠️ Important Disclaimers and Risks

**WARNING: This software is for experienced XRPL developers only.**

- This is **experimental software** provided as-is, without any warranty or guarantee.
- **DO NOT USE** this software unless you fully understand:
  - XRPL token creation mechanics
  - Trust line operations
  - Wallet management and security
  - XRP reserve requirements
  - The source code of this application

### Potential Risks:
1. **Financial Loss**: Incorrect usage could result in:
   - Loss of XRP through incorrect transactions
   - Irreversible token creation mistakes
   - Unrecoverable wallet access if seeds are not properly saved

2. **Security Considerations**:
   - Wallet seeds are displayed during creation
   - Seeds must be securely stored by the user
   - No encryption of sensitive data in memory

3. **Network Risks**:
   - Mainnet transactions are irreversible
   - Network fees are non-refundable
   - Rate limiting on testnet faucet

## Features

- Step-by-step token creation wizard
- Wallet creation with backup options
- Automatic testnet funding
- Real-time balance checking
- Transaction tracking with explorer links
- Support for both testnet and mainnet

## Prerequisites

- Node.js 14+ and npm
- Understanding of XRPL concepts
- Development experience
- Windows 10/11 operating system

## Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/xrpl-token-creation.git
cd xrpl-token-creation

# Install dependencies
npm install

# Start the application
npm start

# Development mode with DevTools
npm run dev
```

## Project Structure

```
xrpl-token-creation/
├── src/
│   ├── main/              # Main process
│   │   ├── main.js        # Main electron process
│   │   └── config.js      # Network configuration
│   ├── renderer/          # UI components
│   │   ├── index.html     # Wizard interface
│   │   ├── renderer.js    # UI logic
│   │   └── styles.css     # Styling
│   └── preload/          # Security bridge
│       └── preload.js     # IPC handlers
├── assets/               # Static assets
└── package.json         # Dependencies
```

## Usage Guide

1. **Network Selection**
   - Start with testnet for development
   - Mainnet requires real XRP and cannot be reversed

2. **Wallet Setup**
   - Create new wallets or import existing ones
   - **CRITICAL**: Save all wallet recovery information
   - Verify wallet balances before proceeding

3. **Token Configuration**
   - Set 3-character currency code (letters only)
   - Specify initial token amount
   - Configure decimal precision (0-15)

4. **Review and Creation**
   - Verify all settings before proceeding
   - Monitor process log for transaction status
   - Check explorer links for confirmation

## Security Features

- Context isolation enabled
- CSP headers implemented
- Secure IPC communication
- No remote code execution
- Wallet seed protection

## Development

```bash
# Run in development mode
npm run dev

# Build for production
npm run build
```

## Testing

Before using on mainnet:
1. Test thoroughly on testnet
2. Verify all transactions
3. Confirm wallet funding
4. Test token transfers
5. Validate trust lines

## Troubleshooting

Common issues:
- Insufficient XRP balance
- Invalid currency codes
- Network connectivity issues
- Testnet faucet rate limiting

## Contributing

1. Fork the repository
2. Create a feature branch
3. Submit a pull request
4. Include comprehensive tests
5. Update documentation

## License

MIT License

Copyright (c) 2024 Karl Lehnert

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Disclaimer

THIS SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

The user assumes all responsibility for:
- Understanding the code
- Securing wallet information
- Managing XRP funds
- Token creation outcomes
- Network transaction fees
- Any potential losses "# issue-xrpl-token" 
