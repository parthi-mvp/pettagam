import assert from 'node:assert/strict';
import { test } from 'node:test';

import { bankFromSender, matchBank } from '../src/catalog/banks.ts';
import { networkFromText } from '../src/catalog/networks.ts';

test('matchBank: names, short forms and aliases', () => {
  assert.equal(matchBank('HDFC Millennia')?.id, 'hdfc');
  assert.equal(matchBank('State Bank savings')?.id, 'sbi');
  assert.equal(matchBank('KVB')?.id, 'kvb');
  assert.equal(matchBank('Citibank card')?.id, 'axis');
  assert.equal(matchBank('SBI Card')?.id, 'sbicard'); // longer match beats "SBI"
  assert.equal(matchBank('Indian Overseas Bank')?.id, 'iob'); // not "Indian Bank"
  assert.equal(matchBank('My chit')?.id, undefined);
});

test('bankFromSender: DLT headers with prefixes and suffixes', () => {
  assert.equal(bankFromSender('AD-HDFCBK')?.id, 'hdfc');
  assert.equal(bankFromSender('VM-ICICIT-S')?.id, 'icici');
  assert.equal(bankFromSender('JD-KOTAKB-T')?.id, 'kotak');
  assert.equal(bankFromSender('HDFCBK')?.id, 'hdfc');
  assert.equal(bankFromSender('+919876543210'), null);
  assert.equal(bankFromSender('AD-SWIGGY'), null);
});

test('networkFromText: card alerts that name the network', () => {
  assert.equal(networkFromText('Rs.1,999 spent on ICICI Bank VISA Card XX8013 at AMAZON'), 'visa');
  assert.equal(networkFromText('Your RuPay Credit Card XX1234 was used for UPI'), 'rupay');
  assert.equal(networkFromText('Txn on MasterCard ending 5267'), 'mastercard');
  assert.equal(networkFromText('American Express Card ending 1005 charged'), 'amex');
  assert.equal(networkFromText('Rs.500 debited from A/c XX9642'), null);
});
