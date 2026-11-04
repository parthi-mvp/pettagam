# Pettagam money catalogue (India)

Research for expanding account types, investment types, banks (with logos) and categories.
Compiled 4 Nov 2026. Bank list per Wikipedia "List of banks in India" (RBI data, as of 1 Oct 2026).
Rates, limits and scheme status change every Budget; re-check before showing any number in the app.

**Today in the app:** 5 account types · 13 investment types · 16 categories (12 expense, 4 income) ·
banks are free text (`institution`) with no list, no logo, no SMS sender match.

---

## 1. Account types

Things money sits in or is owed on. ★ = already in the app.

| Group | Type | Notes / why it matters |
|---|---|---|
| Bank | ★ Savings account | Most common; covers salary accounts too (add a "Salary" flag rather than a type). |
| Bank | Current account | Business owners, freelancers. Same maths as savings. |
| Bank | Overdraft / OD against FD | Negative balance is normal; limit like a credit card. |
| Bank | NRE / NRO account | NRIs; worth a type only if NRI users matter. |
| Card | ★ Credit card | Due, limit, statement day already modelled. |
| Card | Forex / travel card | Prepaid, foreign currency. Low priority. |
| Wallet | ★ Wallet / UPI | Paytm, PhonePe, Amazon Pay, MobiKwik, Freecharge balances. |
| Wallet | Meal / benefit card | Pluxee (ex-Sodexo), Zeta. Salary benefit balance, spent at restaurants and groceries. |
| Wallet | FASTag | Toll wallet; frequent small debits that SMS alerts report. |
| Wallet | Gift card / store credit | Amazon gift balance, Flipkart gift card. |
| Cash | ★ Cash | |
| Borrowing | ★ Loan | One type today. Split by purpose (below) for better icons and insights. |
| Borrowing | Pay Later / BNPL | Simpl, LazyPay, Amazon Pay Later, Flipkart Pay Later. Behaves like a card. |
| People | Money lent | "Kai maathu": money a friend or relative owes you. An asset. |
| People | Money borrowed | Money you owe a person. A liability. |

**Loan purposes:** home, car, two-wheeler, personal, education, gold, loan against property, loan against
securities / FD, consumer durable (no-cost EMI), credit line (e.g. slice, Kotak credit line).

**Recommendation:** add `overdraft`, `meal_card`, `fastag`, `pay_later`, `lent`, `borrowed`, plus a
`loan_kind` field. Lent / borrowed is the biggest win: Indian users track this constantly and no
default app does it well.

---

## 2. Investment types

★ = already in the app. "Fields" lists what the form needs beyond name, institution and amount.

### Deposits
| Type | Fields | Notes |
|---|---|---|
| ★ Fixed deposit (bank) | rate, start, maturity, payout (cumulative / monthly / quarterly) | Add payout mode; senior citizen rate. |
| Corporate FD | rate, maturity, issuer rating | Bajaj Finance, Shriram, Mahindra Finance. Higher risk than bank FD. |
| ★ Recurring deposit | monthly amount, rate, tenure | |
| Tax-saver FD | as FD | 5-year lock-in; 80C. Could be an FD flag. |

### Post office and government small savings
| Type | Fields | Notes |
|---|---|---|
| ★ PPF | yearly deposits, open date | 15-year term, extend in 5-year blocks; up to ₹1.5 lakh a year. |
| Sukanya Samriddhi (SSY) | child, yearly deposits | Girl child; ₹250 minimum, ₹1.5 lakh a year. |
| Senior Citizens' Savings Scheme (SCSS) | amount, rate, quarterly payout | Age 60+. |
| National Savings Certificate (NSC) | amount, rate, maturity | 5 years. |
| Kisan Vikas Patra (KVP) | amount, maturity | Doubles the money over a fixed tenure. |
| Post Office Monthly Income Scheme (MIS) | amount, monthly payout | |
| Post Office Time Deposit | tenure 1/2/3/5 years | |
| Post Office RD | as RD | |
| RBI Floating Rate Savings Bonds | amount, rate | Rate resets every 6 months. |

### Retirement
| Type | Fields | Notes |
|---|---|---|
| ★ EPF | monthly contribution, UAN (optional) | Add VPF as a flag. |
| ★ NPS | tier I / II, allocation | 80CCD(1B) extra ₹50,000 deduction. |
| Atal Pension Yojana (APY) | monthly contribution, pension slab | |
| Gratuity (accrued) | years of service | Optional; it's an entitlement, not an investment. |

### Market-linked
| Type | Fields | Notes |
|---|---|---|
| ★ Stocks | units, avg price | Indian equities. |
| US / international stocks | units, currency | Via LRS apps (Vested, INDmoney). |
| ★ Mutual fund | units, NAV, SIP amount | Add subtype: equity, debt, hybrid, index, ELSS (tax-saver). |
| ETF | units | Includes gold and silver ETFs. |
| REIT | units | Embassy, Mindspace, Brookfield, Nexus. |
| InvIT | units | |
| ★ Bonds | face value, coupon, maturity | Government securities (RBI Retail Direct), T-bills, corporate bonds / NCDs. |
| PMS / AIF | amount | High-net-worth; low priority. |
| ESOP / RSU | units, vesting dates | Employees of listed and unlisted companies. |
| Unlisted / startup shares | amount | Angel or pre-IPO. |
| P2P lending | amount, platform | LenDenClub etc.; RBI tightened rules in 2024. |
| ★ Crypto | units | |

### Gold and silver
| Type | Fields | Notes |
|---|---|---|
| ★ Gold (physical / jewellery) | grams, purity (22K/24K) | Add purity. |
| Digital gold | grams, platform | |
| Sovereign Gold Bond | units, series, maturity | **No new issues since Budget 2025-26.** Keep it for existing holdings only. |
| Silver | grams | Physical or digital. |

### Insurance with savings
| Type | Fields | Notes |
|---|---|---|
| LIC / endowment / money-back | premium, sum assured, maturity | Very common in India. |
| ULIP | premium, fund value | |
| Annuity | purchase price, monthly payout | |

### Other
| Type | Fields | Notes |
|---|---|---|
| ★ Chit fund | chit value, months, installment | |
| ★ Real estate | purchase price, current value | Split into house / flat, plot, agricultural land, commercial. |
| ★ Other | | |

**Recommendation:** grow from 13 to about 25 types, grouped in the type sheet by the headings above
(the sheet already supports icons and descriptions). The largest gaps are the post-office family
(SSY, SCSS, NSC, KVP, MIS), ETF / REIT / InvIT, digital gold and SGB, LIC / ULIP, and corporate FD.

---

## 3. Banks

### Public sector banks (12)
State Bank of India · Bank of Baroda · Bank of India · Bank of Maharashtra · Canara Bank ·
Central Bank of India · Indian Bank · Indian Overseas Bank · Punjab and Sind Bank ·
Punjab National Bank · UCO Bank · Union Bank of India

### Private sector banks (21)
Axis Bank · Bandhan Bank · CSB Bank · City Union Bank · DCB Bank · Dhanlaxmi Bank · Federal Bank ·
HDFC Bank · ICICI Bank · IDBI Bank · IDFC First Bank · IndusInd Bank · Jammu & Kashmir Bank ·
Karnataka Bank · Karur Vysya Bank · Kotak Mahindra Bank · Nainital Bank · RBL Bank ·
South Indian Bank · Tamilnad Mercantile Bank · Yes Bank

### Small finance banks (11 listed)
AU · Capital · Equitas · ESAF · Jana · Shivalik · Slice · Suryoday · Ujjivan · Unity · Utkarsh

### Payments banks (5)
Airtel Payments Bank · Fino Payments Bank · India Post Payments Bank · Jio Payments Bank ·
NSDL Payments Bank

### Foreign banks with Indian retail customers (pick a few of the 44)
HSBC · Standard Chartered · DBS Bank India · American Express (cards) · Deutsche Bank.
Citibank India's retail business moved to Axis Bank in 2023, so map "Citi" to Axis.

### Also worth listing
- **Card issuers that aren't banks:** SBI Card, American Express, OneCard, Scapia.
- **Wallets:** Paytm, PhonePe, Amazon Pay, MobiKwik, Freecharge, Pluxee.
- **Lenders:** Bajaj Finance, Tata Capital, HDB Financial, Shriram Finance, Muthoot / Manappuram (gold loans).
- **Co-operative and regional rural banks:** too many to bundle (34 state, 352 district, 1,400+ urban
  co-op; 28 RRBs). Allow free text with a monogram for these.

**Tamil Nadu note:** Indian Bank, Indian Overseas Bank, City Union Bank, Karur Vysya Bank,
Tamilnad Mercantile Bank and TN State Apex Co-op are headquartered in Tamil Nadu. Put them near
the top for this audience.

### Aliases to match free text and SMS
SBI = State Bank; BOB = Bank of Baroda; PNB = Punjab National; IOB = Indian Overseas;
KVB = Karur Vysya; CUB = City Union; TMB = Tamilnad Mercantile; SIB = South Indian;
IDFC = IDFC First; Kotak = Kotak Mahindra; J&K = Jammu & Kashmir; IPPB = India Post Payments.
Build the SMS sender map from real alerts in users' inboxes rather than from memory.

---

## 4. Logos

**Recommendation: bundle, don't fetch.** Pettagam is offline-first, so a network logo service would
show blank tiles offline and leak which banks a user has to a third party.

1. **Bundle about 60 small logos** (the 12 + 21 + 11 + 5 above, plus the big foreign banks, card
   issuers and wallets) as 96×96 PNG or SVG in `assets/banks/`, keyed by a slug (`hdfc`, `sbi`…).
2. **Fallback monogram:** initials on the bank's brand colour (e.g. "KVB" on green). Use it for
   co-op banks, RRBs and anything unmatched. Store a brand colour for every bundled bank too.
3. **Sourcing:** take each logo from the bank's official site or press kit once, at design time.
   There's no open-source Indian bank logo set. Clearbit's free logo API shut down in Dec 2025.
   Logo.dev's free tier requires visible attribution. Brandfetch says it needs no attribution.
   A paid Framer set of 60+ Indian banking and UPI logos exists.
4. **Trademarks:** the logos are the banks' trademarks. Showing them to label a user's own accounts
   is common practice in finance apps, but don't alter them or imply endorsement. Get legal advice
   before a public release.

---

## 5. Categories

★ = an existing default. Suggested icons use the app's current icon set.

### Expense
| Category | Icon | Subcategories / examples | SMS merchant hints |
|---|---|---|---|
| ★ Food & Dining | coffee | Restaurants, delivery, cafés & snacks, office canteen | swiggy, zomato, eatsure, domino, starbucks |
| ★ Groceries | cart | Kirana, supermarket, quick commerce, vegetables, milk & dairy | bigbasket, blinkit, zepto, instamart, dmart, jiomart |
| Housing (★ Rent & Housing) | house | Rent, maintenance / society charges, repairs, furnishing | nobroker, mygate |
| ★ Bills & Utilities | receipt | Electricity (TNEB etc.), water, LPG / PNG, broadband, DTH | tneb, tangedco, bescom, indane, act fibernet |
| Mobile & Internet | phone | Prepaid recharge, postpaid, data packs | jio, airtel, vi, bsnl |
| Subscriptions | repeat | OTT, music, cloud, apps | netflix, hotstar, spotify, youtube, apple, google |
| Transport (★ Fuel & Transport) | fuel | Fuel, cab / auto, metro / bus / local train, parking, tolls (FASTag), vehicle service | uber, ola, rapido, iocl, hpcl, bpcl, fastag |
| ★ Travel | plane | Flights, trains, buses, hotels, holidays | irctc, redbus, makemytrip, indigo, goibibo |
| ★ Shopping | bag | Clothing, electronics, home & kitchen, online shopping | amazon, flipkart, myntra, ajio, meesho, croma |
| Personal care | heart | Salon, grooming, cosmetics | nykaa, urban company |
| ★ Health | heart | Doctor, pharmacy, lab tests, fitness | apollo, pharmeasy, 1mg, practo, cult |
| Insurance | lock | Term / LIC, health, vehicle premiums | lic, policybazaar, acko, star health |
| ★ Education | book | School / college fees, tuition, courses, books | byju, unacademy, school names |
| Family & Kids | home | Childcare, toys, elder care, pocket money | firstcry |
| Domestic help | home | Maid, cook, driver, watchman | (usually cash or UPI to a person) |
| Gifts & Festivals | gift | Diwali / Pongal shopping, gifts, weddings and functions (moi) | |
| Religious & Charity | heart | Temple offerings, donations (80G) | |
| ★ Entertainment | film | Movies, events, games | bookmyshow, pvr, district |
| ★ EMI & Loans | card | Home / car / personal EMI, card interest | emi, nach, ecs |
| Taxes | bank | Income tax, advance tax, property tax | incometax, tin-nsdl |
| Fees & Charges | receipt | Bank charges, late fees, forex markup, convenience fees | |
| Pets | heart | Food, vet, grooming | supertails |
| ★ Others | list | | |

### Income
| Category | Icon | Examples |
|---|---|---|
| ★ Salary | bank | Monthly pay |
| Bonus & incentives | gift | Bonus, variable pay, joining bonus |
| Business / freelance | trend | Client payments, shop income |
| Rent received | house | Tenant rent |
| ★ Interest & Dividends | coin | SB / FD interest, dividends |
| Investment returns | trend | Redemptions, capital gains, chit prize |
| ★ Refund / Cashback | refund | Order refunds, card cashback, rewards |
| Reimbursements | receipt | Office expenses paid back |
| Gifts received | gift | Moi, festival money |
| Pension | bank | Pension, annuity |
| Tax refund | bank | Income tax refund |
| ★ Other Income | coin | |

**Not categories:** moving money between your own accounts (ATM withdrawal, card bill payment,
SIP, wallet top-up) should be a *transfer*, not an expense. Otherwise it's counted twice.

**Recommendation:** go from 16 to 35 defaults (23 expense, 12 income). Add parent/child only
if users ask for it; flat categories with good icons are easier to pick from on a phone. Move the
merchant hints into the SMS parser's existing merchant-to-category map.

---

## Suggested order of work
1. Categories: add the 19 new defaults with icons and SMS merchant hints. This needs no schema change.
2. Banks: a bundled list with aliases, logo-or-monogram in account rows, and the bank chosen from a sheet.
3. Account types: lent / borrowed, pay later, meal card, FASTag, overdraft, and loan purpose.
4. Investment types: the post-office family, ETF / REIT / InvIT, digital gold / SGB, LIC / ULIP, corporate FD.

## Sources
- [List of banks in India (Wikipedia)](https://en.wikipedia.org/wiki/List_of_banks_in_India)
- [RBI: Scheduled banks' statement of position](https://rbi.org.in/Scripts/BS_StatisticsDisplay.aspx?Id=541)
- [Angel One: safe investment options in India](https://www.angelone.in/knowledge-center/personal-finance/safe-investment-options-in-india)
- [Stable Money: types of investments](https://stablemoney.in/blog/types-of-investments)
- [ICICI Pru: types of investment](https://www.iciciprulife.com/investments/types-of-investment.html)
- [Business Today: SGB discontinued, Gold Monetisation Scheme closed](https://www.businesstoday.in/personal-finance/investment/story/gold-prices-up-after-sovereign-gold-bonds-govt-discontinues-gold-monetisation-scheme-check-details-470423-2025-04-02)
- [Angel One: SGB discontinued, alternatives](https://www.angelone.in/news/personal-finance/sgb-discontinued-check-alternatives-for-gold-investments)
- [Juspay: prepaid payment instruments](https://juspay.io/blog/prepaid-payment-instrument)
- [Logo.dev: Clearbit logo API has shut down](https://www.logo.dev/clearbit)
- [Brandfetch: Clearbit comparison](https://docs.brandfetch.com/comparisons/clearbit)
- [Framer: Indian banking & UPI logos (paid)](https://www.framer.com/marketplace/vectors/banking-upi-logos/)
- [Moneyview: expense tracker apps in India](https://moneyview.in/loan-insights/best-money-management-apps-in-india)
