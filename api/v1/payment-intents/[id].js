import intentHandler from '../[id].js';

export default async function paymentIntentById(req, res) {
  return intentHandler(req, res);
}

