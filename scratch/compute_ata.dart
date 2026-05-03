import 'package:solana/solana.dart';
import 'package:solana/encoder.dart';

void main() async {
  final mint = 'idrxZcP8xiKkYk6XGD4uz1dxEYCWSgKDHqgjsBbwDur';
  final owner = '35z7X59rtyts557Up1RAwpyYN7x2cFqcDc7RjPuNxFzr';
  
  final ata = await findAssociatedTokenAddress(
    owner: Ed25519HDPublicKey.fromBase58(owner),
    mint: Ed25519HDPublicKey.fromBase58(mint),
  );
  
  print('ATA: ${ata.toBase58()}');
}
