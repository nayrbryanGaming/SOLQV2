// derive_ata.js
const solanaWeb3 = require('@solana/web3.js');
const splToken = require('@solana/spl-token');

async function main() {
    const owner = new solanaWeb3.PublicKey("ETcQvsQek2w9feLfsqoe4AypCWfnrSwQiv3djqocaP2m");
    const mint = new solanaWeb3.PublicKey("idrxZcP8xiKkYk6XGD4uz1dxEYCWSgKDHqgjsBbwDur");

    // Derive Associated Token Address
    const ata = await splToken.getAssociatedTokenAddress(
        mint,
        owner,
        true // allow owner off curve
    );

    console.log("ATA:", ata.toBase58());
}

main().catch(console.error);
