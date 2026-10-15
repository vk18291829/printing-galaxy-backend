import { paymentsApi } from './api';

interface RazorpayResponse {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

interface RazorpayInstance {
  open: () => void;
  on: (event: string, handler: () => void) => void;
}

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance;
  }
}

let scriptPromise: Promise<void> | null = null;

function loadCheckoutScript() {
  scriptPromise ??= new Promise<void>((resolve, reject) => {
    if (window.Razorpay) return resolve();
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error('Could not load the payment window. Check your connection.'));
    };
    document.body.appendChild(script);
  });
  return scriptPromise;
}

/**
 * Opens Razorpay Checkout for an existing order.
 * Resolves `true` when the payment is verified by the server, `false` if the customer closes the window.
 */
export async function payWithRazorpay(orderId: string, lang: string): Promise<boolean> {
  const [rzp] = await Promise.all([paymentsApi.createRazorpayOrder(orderId), loadCheckoutScript()]);
  const Razorpay = window.Razorpay;
  if (!Razorpay) throw new Error('Payment window is unavailable');

  return new Promise<boolean>((resolve, reject) => {
    const checkout = new Razorpay({
      key: rzp.keyId,
      amount: rzp.amount,
      currency: rzp.currency,
      order_id: rzp.razorpayOrderId,
      name: 'Printing Galaxy',
      description: `Order ${rzp.orderNumber}`,
      image: `${window.location.origin}/logo.png`,
      prefill: rzp.prefill,
      theme: { color: '#1d6cf0' },
      config: { display: { language: lang === 'hi' ? 'hi' : 'en' } },
      handler: (response: RazorpayResponse) => {
        paymentsApi.verify(response).then(() => resolve(true), reject);
      },
      modal: { ondismiss: () => resolve(false) },
    });
    checkout.open();
  });
}
