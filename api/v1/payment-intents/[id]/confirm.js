import intentHandler from '../../[id].js';

export default async function paymentIntentConfirm(req, res) {
  return intentHandler(req, res);
}

