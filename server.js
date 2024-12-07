const express = require('express');
const cors = require('cors');
const { Connection, PublicKey, LAMPORTS_PER_SOL, Keypair } = require('@solana/web3.js');
const mongoose = require('mongoose');
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(express.json());

// MongoDB Connection
mongoose.connect('mongodb://localhost:27017/solwaveairdrop', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

// User Schema
const userSchema = new mongoose.Schema({
  walletAddress: { type: String, unique: true },
  referralCode: { type: String, unique: true },
  referredBy: String,
  referralCount: { type: Number, default: 0 },
  tokensClaimed: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

// Airdrop Configuration
const AIRDROP_CONFIG = {
  NETWORK: 'devnet', // or 'mainnet-beta'
  BASE_AIRDROP_AMOUNT: 200, // Base SWAVE tokens
  REFERRAL_BONUS: 50, // Additional tokens per referral
  MAX_REFERRAL_BONUS: 1000, // Maximum bonus tokens from referrals
  TOTAL_AIRDROP_SUPPLY: 200000000,
  MINIMUM_WALLET_BALANCE: 0.1,
  AIRDROP_WALLET_PRIVATE_KEY: process.env.AIRDROP_WALLET_PRIVATE_KEY
};

// Solana connection
const connection = new Connection(
  AIRDROP_CONFIG.NETWORK === 'mainnet-beta' 
    ? 'https://api.mainnet-beta.solana.com' 
    : 'https://api.devnet.solana.com'
);

// Generate unique referral code
function generateReferralCode(walletAddress) {
  return crypto.createHash('md5').update(walletAddress + Date.now().toString()).digest('hex').substring(0, 8);
}

// Register new user
app.post('/api/register', async (req, res) => {
  try {
    const { walletAddress, referralCode } = req.body;
    
    // Check if wallet already registered
    const existingUser = await User.findOne({ walletAddress });
    if (existingUser) {
      return res.status(400).json({ error: 'Wallet already registered' });
    }

    // Create new user
    const newUser = new User({
      walletAddress,
      referralCode: generateReferralCode(walletAddress)
    });

    // If referral code provided, update referrer's count
    if (referralCode) {
      const referrer = await User.findOne({ referralCode });
      if (referrer) {
        newUser.referredBy = referrer.walletAddress;
        await User.updateOne(
          { referralCode },
          { $inc: { referralCount: 1 } }
        );
      }
    }

    await newUser.save();
    
    res.json({
      success: true,
      referralCode: newUser.referralCode,
      message: 'Successfully registered for airdrop'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get user stats
app.get('/api/user/:walletAddress', async (req, res) => {
  try {
    const user = await User.findOne({ walletAddress: req.params.walletAddress });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const referralBonus = Math.min(
      user.referralCount * AIRDROP_CONFIG.REFERRAL_BONUS,
      AIRDROP_CONFIG.MAX_REFERRAL_BONUS
    );

    res.json({
      referralCode: user.referralCode,
      referralCount: user.referralCount,
      totalTokens: AIRDROP_CONFIG.BASE_AIRDROP_AMOUNT + referralBonus,
      tokensClaimed: user.tokensClaimed
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Airdrop wallet (replace with your actual airdrop wallet)
const airdropWallet = Keypair.generate();

// Airdrop tracking
const airdropClaimed = new Set();

app.post('/connect-wallet', async (req, res) => {
  try {
    const { publicKey } = req.body;
    
    // Validate public key
    const walletPublicKey = new PublicKey(publicKey);
    
    // Check wallet balance
    const balance = await connection.getBalance(walletPublicKey);
    
    // Minimum balance check
    if (balance / LAMPORTS_PER_SOL < AIRDROP_CONFIG.MINIMUM_WALLET_BALANCE) {
      return res.status(400).json({ 
        error: 'Insufficient SOL balance for airdrop' 
      });
    }

    res.json({ 
      status: 'Connected', 
      message: 'Wallet successfully connected' 
    });
  } catch (error) {
    res.status(500).json({ 
      error: 'Wallet connection failed', 
      details: error.message 
    });
  }
});

app.post('/check-eligibility', async (req, res) => {
  try {
    const { publicKey } = req.body;
    
    // Check if wallet has already claimed
    if (airdropClaimed.has(publicKey)) {
      return res.status(400).json({ 
        error: 'Airdrop already claimed' 
      });
    }

    res.json({ 
      eligible: true, 
      amount: AIRDROP_CONFIG.BASE_AIRDROP_AMOUNT 
    });
  } catch (error) {
    res.status(500).json({ 
      error: 'Eligibility check failed', 
      details: error.message 
    });
  }
});

app.post('/claim-tokens', async (req, res) => {
  try {
    const { publicKey } = req.body;
    const walletPublicKey = new PublicKey(publicKey);

    // Prevent multiple claims
    if (airdropClaimed.has(publicKey)) {
      return res.status(400).json({ 
        error: 'Tokens already claimed' 
      });
    }

    // Simulate token transfer (replace with actual token transfer logic)
    airdropClaimed.add(publicKey);

    // Update user's tokensClaimed status
    await User.updateOne({ walletAddress: publicKey }, { tokensClaimed: true });

    res.json({ 
      status: 'Success', 
      message: `${AIRDROP_CONFIG.BASE_AIRDROP_AMOUNT} SWAVE tokens claimed`,
      txHash: 'simulated_transaction_hash'
    });
  } catch (error) {
    res.status(500).json({ 
      error: 'Token claim failed', 
      details: error.message 
    });
  }
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Airdrop server running on port ${PORT}`);
});

module.exports = app;
