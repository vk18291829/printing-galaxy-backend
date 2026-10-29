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
 * Asks the server whether the payment went through after all (UPI approved after the window
 * closed, verify call lost on a bad network). Never throws: an unanswered check counts as not paid.
 */
async function paidAfterAll(orderId: string) {
  try {
    return (await paymentsApi.check(orderId)).paid;
  } catch {
    return false;
  }
}

/**
 * Opens Razorpay Checkout for an existing order.
 * Resolves `true` once the server has the payment, `false` if it did not go through. Before
 * saying "not paid" it checks with the server, so a payment that did succeed is never paid twice.
 */
export async function payWithRazorpay(orderId: string, lang: string): Promise<boolean> {
  try {
    if (await openCheckout(orderId, lang)) return true;
  } catch (err) {
    if (await paidAfterAll(orderId)) return true;
    throw err;
  }
  return paidAfterAll(orderId);
}

async function openCheckout(orderId: string, lang: string): Promise<boolean> {
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
      image: `${window.location.origin}/logo.png?v=3`,
      prefill: rzp.prefill,
      theme: { color: '#0b2a65' },
      config: { display: { language: lang === 'hi' ? 'hi' : 'en' } },
      handler: (response: RazorpayResponse) => {
        paymentsApi.verify(response).then(() => resolve(true), reject);
      },
      modal: { ondismiss: () => resolve(false) },
    });
    checkout.open();
  });
}
