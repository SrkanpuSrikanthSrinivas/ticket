import braintree from 'braintree';

export const gateway = new braintree.BraintreeGateway({
  environment: process.env.BT_ENV === 'production'
    ? braintree.Environment.Production
    : braintree.Environment.Sandbox,
  merchantId: process.env.BT_MERCHANT_ID,
  publicKey: process.env.BT_PUBLIC_KEY,
  privateKey: process.env.BT_PRIVATE_KEY,
});
