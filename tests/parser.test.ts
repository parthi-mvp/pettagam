import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseSms } from '../src/sms/parser.ts';

const sms = (body: string) => ({ address: 'AD-HDFCBK', body, date: 1762000000000 });

test('UPI debit with balance', () => {
  const r = parseSms(
    sms('Rs.450.00 debited from A/c XX1234 on 02-11-26 to VPA swiggy@icici. UPI Ref 123456. Avl Bal Rs 10,234.50 -HDFC Bank')
  );
  assert.ok(r);
  assert.equal(r.type, 'expense');
  assert.equal(r.amount, 450);
  assert.equal(r.last4, '1234');
  assert.equal(r.balance, 10234.5);
  assert.equal(r.merchant, 'swiggy@icici');
  assert.equal(r.categoryHint, 'Food & Dining');
});

test('Credit card spend', () => {
  const r = parseSms(
    sms('INR 1,299.00 spent on ICICI Bank Card XX5678 on 01-Nov-26 at AMAZON PAY. Avl Lmt: INR 85,000.00. To dispute call 1800')
  );
  assert.ok(r);
  assert.equal(r.type, 'expense');
  assert.equal(r.amount, 1299);
  assert.equal(r.last4, '5678');
  assert.equal(r.instrument, 'card');
  assert.equal(r.merchant, 'AMAZON PAY');
  assert.equal(r.balance, 85000);
  assert.equal(r.categoryHint, 'Shopping');
});

test('Salary credit', () => {
  const r = parseSms(
    sms('Your A/c XXXXX4321 is credited with Rs.50,000.00 on 01/11/2026 by NEFT-ACME CORP SALARY. Avl Bal: Rs.1,20,000.00')
  );
  assert.ok(r);
  assert.equal(r.type, 'income');
  assert.equal(r.amount, 50000);
  assert.equal(r.last4, '4321');
  assert.equal(r.balance, 120000);
  assert.equal(r.categoryHint, 'Salary');
});

test('SBI style debit then credited to beneficiary is an expense', () => {
  const r = parseSms(
    sms('Dear UPI user A/C X9876 debited by 500.0 on date 02Nov26 trf to RAMESH K Refno 123456789. If not u? call 1800111109. -SBI Rs 500')
  );
  assert.ok(r);
  assert.equal(r.type, 'expense');
  assert.equal(r.last4, '9876');
});

test('Card bill payment received', () => {
  const r = parseSms(sms('Payment of Rs 5,000.00 has been received towards your credit card ending 5678. Thank you.'));
  assert.ok(r);
  assert.equal(r.type, 'income');
  assert.equal(r.amount, 5000);
  assert.equal(r.last4, '5678');
});

test('Ignores OTP, reminders, promos and failures', () => {
  assert.equal(parseSms(sms('123456 is your OTP for txn of Rs 999 at FLIPKART. Do not share.')), null);
  assert.equal(parseSms(sms('Your card XX5678 bill of Rs 12,000 is due on 05-Nov. Min amt due Rs 600.')), null);
  assert.equal(parseSms(sms('Get a pre-approved personal loan of Rs 5,00,000. Apply now!')), null);
  assert.equal(parseSms(sms('Txn of Rs 200 on card XX5678 at ZOMATO declined due to insufficient limit')), null);
  assert.equal(parseSms(sms('Rs 1,000 will be debited from your A/c XX1234 on 05-Nov towards SIP')), null);
});

test('Same SMS hashes identically (dedupe)', () => {
  const body = 'Rs.100 debited from A/c XX1234 to VPA a@b';
  assert.equal(parseSms(sms(body))?.hash, parseSms(sms(body))?.hash);
});

test('catalogue rules: specific categories win over broad ones', () => {
  const hint = (body: string) => parseSms(sms(body))?.categoryHint;
  assert.equal(hint('Rs.299.00 debited from A/c XX1234 on 02-11-26 for Jio recharge. UPI Ref 1'), 'Mobile & Internet');
  assert.equal(hint('INR 649.00 spent on HDFC Bank Card XX5678 at NETFLIX.COM on 01-Nov-26'), 'Subscriptions');
  assert.equal(hint('Rs.12,400.00 credited to A/c XX1234 on 02-11-26 towards Income Tax Refund CPC'), 'Tax Refund');
  assert.equal(hint('Rs.499.00 credited to A/c XX1234 on 02-11-26 refund from MYNTRA'), 'Refund / Cashback');
  assert.equal(hint('Rs.25,000.00 debited from A/c XX1234 on 02-11-26 for LIC premium'), 'Insurance');
});

test('ATM withdrawals are flagged (imported as a transfer to Cash, not spending)', () => {
  const atm = parseSms(sms('Rs.5000.00 withdrawn at ATM S1AW000123 from A/c XX1234 on 03-11-26. Avl Bal Rs 20,000.00 -HDFC Bank'));
  assert.ok(atm);
  assert.equal(atm.type, 'expense');
  assert.equal(atm.atm, true);
  assert.equal(atm.merchant, 'ATM withdrawal');
  assert.equal(atm.categoryHint, null);
  const nfs = parseSms(sms('A/c X9876 debited by Rs 2,000.00 on 02Nov26 for NFS cash withdrawal. -SBI'));
  assert.equal(nfs?.atm, true);
  const deposit = parseSms(sms('Rs.3000.00 cash deposited at ATM to A/c XX1234 on 03-11-26 -HDFC Bank'));
  assert.equal(deposit?.atm ?? false, false);
  const spend = parseSms(sms('INR 649.00 spent on HDFC Bank Card XX5678 at NETFLIX.COM on 01-Nov-26'));
  assert.equal(spend?.atm, false);
});

test('ATM alert by debit card: digits come from the card', () => {
  const r = parseSms(sms('Thanks for using HDFC Bank Debit Card XX5678 for Rs 5000.00 at ATM S1AW000123 on 2026-11-03. Avl Bal Rs 15,000.00'));
  assert.ok(r);
  assert.equal(r.atm, true);
  assert.equal(r.last4, '5678');
  assert.equal(r.instrument, 'card');
});
