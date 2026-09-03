'use client';

import { useEffect, useState } from 'react';

type Step = 'plan' | 'pay' | 'done';

const PRICE = '$9.99';
const TERM = '30 days';

const PERKS = [
  'Exact BMR, TDEE and daily calorie intake',
  'Realistic week-by-week timeline',
  'Personalised, deterministic guidance',
  'One-time recovery code for any device',
];

/**
 * Simulated checkout. Card fields are demo-only: they are NEVER sent anywhere —
 * the actual entitlement is granted by the server-side /pay callback (idempotent).
 */
export function CheckoutModal({
  open,
  paying,
  error,
  onPay,
  onClose,
}: {
  open: boolean;
  paying: boolean;
  error: string | null;
  onPay: () => Promise<boolean>;
  onClose: () => void;
}) {
  const [step, setStep] = useState<Step>('plan');
  const [method, setMethod] = useState<'card' | 'paypal'>('card');
  const [card, setCard] = useState({ number: '4242 4242 4242 4242', exp: '12/30', cvc: '123', name: '' });

  useEffect(() => {
    if (open) setStep('plan');
  }, [open]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && open && !paying) onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, paying, onClose]);

  if (!open) return null;

  async function confirmPay() {
    const ok = await onPay();
    if (ok) setStep('done');
  }

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget && !paying) onClose();
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-label="Simulated premium checkout">
        <div className="modal-head">
          <h2>{step === 'done' ? "You're Premium" : 'Unlock Premium'}</h2>
          {!paying && (
            <button className="modal-close" onClick={onClose} aria-label="Close">
              ✕
            </button>
          )}
        </div>

        {step === 'plan' && (
          <>
            <div className="plan-box">
              <div className="row">
                <strong>WellPath Premium</strong>
                <span className="plan-price">{PRICE}</span>
              </div>
              <div className="row">
                <span className="plan-per">Full plan · billed once for {TERM}</span>
                <span className="plan-per">/ {TERM}</span>
              </div>
            </div>
            <ul style={{ margin: '0 0 16px', paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 8, color: 'var(--text)', fontSize: 14, lineHeight: 1.5 }}>
              {PERKS.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
            <button className="btn btn-accent" style={{ width: '100%' }} onClick={() => setStep('pay')}>
              Continue to payment
            </button>
            <p className="demo-note">Demo checkout for the engineering challenge — no real payment is taken and no card is required.</p>
          </>
        )}

        {step === 'pay' && (
          <>
            <div className="pay-method active" onClick={() => setMethod('card')}>
              <input type="radio" checked={method === 'card'} readOnly aria-label="Pay by card" />
              <span className="grow">Credit / debit card</span>
              <span style={{ fontSize: 18 }}>💳</span>
            </div>
            <div className="pay-method" onClick={() => setMethod('paypal')}>
              <input type="radio" checked={method === 'paypal'} readOnly aria-label="Pay with PayPal" />
              <span className="grow">PayPal</span>
              <span style={{ fontSize: 13, color: 'var(--faint)' }}>demo only</span>
            </div>

            {method === 'card' ? (
              <>
                <div className="pay-field">
                  <label htmlFor="ck-name">Name on card</label>
                  <input id="ck-name" value={card.name} onChange={(e) => setCard({ ...card, name: e.target.value })} placeholder="Demo User" autoComplete="off" />
                </div>
                <div className="pay-field">
                  <label htmlFor="ck-num">Card number</label>
                  <input id="ck-num" inputMode="numeric" value={card.number} onChange={(e) => setCard({ ...card, number: e.target.value })} autoComplete="off" />
                </div>
                <div className="pay-grid2">
                  <div className="pay-field">
                    <label htmlFor="ck-exp">Expiry</label>
                    <input id="ck-exp" value={card.exp} onChange={(e) => setCard({ ...card, exp: e.target.value })} autoComplete="off" />
                  </div>
                  <div className="pay-field">
                    <label htmlFor="ck-cvc">CVC</label>
                    <input id="ck-cvc" inputMode="numeric" value={card.cvc} onChange={(e) => setCard({ ...card, cvc: e.target.value })} autoComplete="off" />
                  </div>
                </div>
              </>
            ) : (
              <p className="demo-note" style={{ margin: '0 0 12px' }}>
                In this demo only the card route is wired to the simulated <code>/pay</code> callback.
              </p>
            )}

            <div className="plan-box" style={{ marginBottom: 12 }}>
              <div className="order-line"><span>WellPath Premium ({TERM})</span><span>{PRICE}</span></div>
              <div className="order-line"><span>Tax</span><span>$0.00</span></div>
              <div className="order-line" style={{ color: 'var(--text)', fontWeight: 700, paddingTop: 6 }}><span>Total due today</span><span>{PRICE}</span></div>
            </div>

            {error && <p className="note danger" role="alert" style={{ marginTop: 0 }}>{error}</p>}

            <button className="btn btn-accent" style={{ width: '100%' }} disabled={paying || method !== 'card'} onClick={confirmPay}>
              {paying ? 'Processing…' : `Pay ${PRICE} (simulated)`}
            </button>
            <button className="btn btn-ghost" style={{ width: '100%', marginTop: 10 }} disabled={paying} onClick={() => setStep('plan')}>
              Back
            </button>
            <p className="demo-note">No card details leave your browser — entitlement is set server-side by the idempotent /pay endpoint.</p>
          </>
        )}

        {step === 'done' && (
          <div style={{ textAlign: 'center' }}>
            <div className="success-mark" aria-hidden>✓</div>
            <p style={{ fontSize: 15, lineHeight: 1.6, color: 'var(--text)' }}>
              Payment succeeded (simulated). Your Premium is active for {TERM} and your full plan is
              unlocked below. Save the one-time recovery code shown on the page.
            </p>
            <button className="btn btn-accent" style={{ width: '100%', marginTop: 6 }} onClick={onClose}>
              View my full plan
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
