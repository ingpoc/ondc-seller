# ONDC Seller QA notes

Ledger: `test-ledger.json`. Full browser harness: `aadhaar-chain/qa`.

Root-cause fixes:
- Vendored `@portfolio/trust-client`
- Aligned demo catalog SKUs with buyer (`basmati-rice-5kg`, `mustard-oil-1l`)
- Seller order list merges `ondc-portfolio-demo-orders` bridge from buyer checkout
