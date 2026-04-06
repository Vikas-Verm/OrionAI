const mongoose = require("mongoose");

// Whitelisted collections — only these can be queried
const ALLOWED_COLLECTIONS = [
  "Bills",
  "Categories",
  "CreditNotes",
  "DealSubmissions",
  "Deals",
  "DebitNotes",
  "EWayBills",
  "Invoices",
  "Ledgers",
  "Orders",
  "PaymentRequests",
  "PaymentsMade",
  "Products",
  "ProofOfDeliveries",
  "PurchaseOrders",
  "Transactions",
  "User",
];

const SCHEMA_DESCRIPTION = `
You have access to the following MongoDB collections from a B2B trade/ERP platform:

=== Bills ===
Purchase bills from sellers.
Key fields:
- _id, number (bill number), internal_number (e.g. PB-POSHN-xxx)
- po_id (ref to PurchaseOrders), seller (ref to User)
- date, due_date, created_date, updated_date
- status_cd: "active" | "cancelled" | "paid" | "unpaid"
- status: "Active" | "Cancelled" | "Paid" | "Unpaid"
- total_amount, total_tax, freight
- payment_summary: { balance_due, total_paid_amount, status_cd }
- lineitems: [{ name, item_id, category_id, unit, gst, rate, qty, amount, amount_wt }]
- tds: { code, percentage, amount }
- trade_type: "Smart" | "Non Smart"
- shipping_address, billing_address
- shipping_address_info: { city, state, pincode, shop_name }
- billing_address_info: { city, state, pincode, shop_name }
- vehicle_number, remarks, is_freight_included

=== CreditNotes ===
Credit notes issued against invoices or purchase orders.
Key fields:
- _id, number, invc_number, bill_number
- po_id, pod_id, invc_id, bill_id, seller
- po_info: { number, internal_number, buyer, buyer_name, buyer_gstin, payment_terms }
- date, invc_date, bill_date, created_date, updated_date
- status_cd: "active" | "cancelled"
- status: "Active" | "Cancelled"
- stage_cd: "completed" | "pending"
- stage: "Completed" | "Pending"
- type: "Returns" | "Discount" | "Other"
- type_cd: "returns" | "discount" | "other"
- cn_for: "invoice" | "bill"
- total_amount, total_tax, freight
- lineitems: [{ name, item_id, category_id, unit, gst, rate, qty, amount, amount_wt }]
- vehicle_number, shipping_address, billing_address
- shipping_address_info: { city, state, pincode, shop_name }
- billing_address_info: { city, state, pincode, shop_name }

=== DebitNotes ===
Debit notes issued against bills or invoices.
Key fields:
- _id, number, bill_number, invc_number
- po_id, bill_id, invc_id, seller
- po_info: { number, internal_number, buyer, buyer_name, buyer_gstin, payment_terms }
- date, bill_date, invc_date, created_date, updated_date
- status_cd: "active" | "cancelled"
- stage_cd: "completed" | "pending"
- type: "Returns" | "Discount"
- type_cd: "returns" | "discount"
- dn_for: "bill" | "invoice"
- total_amount, total_tax, freight
- tds: { code, percentage, amount }
- lineitems: [{ name, item_id, category_id, unit, gst, rate, qty, amount }]
- vehicle_number, remarks

=== DealSubmissions ===
Seller submissions against deals/RFQs.
Key fields:
- _id, deal (ref to Deals), seller (ref to Organisations)
- status_cd: "converted" | "pending" | "rejected" | "expired"
- status: "Converted" | "Pending" | "Rejected" | "Expired"
- my_price, my_qty, delivery_date
- gst_included, freight_included
- created_date, updated_date, created_by

=== DebitNotes ===
Debit notes issued against bills.
Key fields: same as above.

=== EWayBills ===
E-Way bills for goods transport.
Key fields:
- _id, number (eway bill number)
- po_id, invc_id, bill_id
- po_info: { number, internal_number, buyer, buyer_name, buyer_gstin }
- date, invc_date, created_date, updated_date
- status_cd: "active" | "cancelled"
- stage_cd: "completed" | "pending"
- vehicle_number, dispatch_address, shipping_address
- dispatch_address_info: { city, state, pincode, shop_name }
- shipping_address_info: { city, state, pincode, shop_name }
- transpoter: { name, phone }
- invc_number, created_by

=== PaymentRequests ===
Payment requests raised for vendor payments.
Key fields:
- _id, number, internal_number (e.g. PR20260302-XXXX)
- seller (ref to Organisations)
- seller_info: { shop_name, gstin, bank_name, bank_ifsc, bank_account_number }
- status_cd: "pending" | "awaiting_approval" | "approved" | "initiated" | "processed" | "rejected"
- trigger_type: "manual" | "automatic"
- net_amount, net_payable, total_amount, total_tax, total_amount_wt
- is_advance, is_against_bill
- bill_id, pod_id, po_id, invc_id
- bill_number, invc_number
- tds: { code, percentage, amount }
- mode: "RTGS" | "NEFT" | "IMPS" | "UPI"
- reference_number, payment_description
- processed_payment_date, created_date, updated_date
- financial_summary: { outstanding_payables, unused_credits, balance }
- approvers: [{ name, status_cd, created_date, reason }]
- timelines: [{ status_cd, created_by_name, created_date }]
- transfer_from_bank: { account_name, account_number, bank_name, ifsc_code }
- used_credits, adjustments, remarks
- created_by, created_by_name

=== PaymentsMade ===
Actual payments made to vendors.
Key fields:
- _id, number, reference_number, reference_pr_id
- amount, applied_amount, available_amount
- status_cd: "active" | "cancelled"
- date, created_date
- is_advance
- tds: { code, percentage, amount }
- payment_mode: "Bank transfer" | "UPI" | "Cash"
- seller_info: { shop_name, gstin, bank_name, bank_ifsc, bank_account_number }
- transfered_from_bank: { account_name, account_number, bank_name, ifsc_code }
- description, bills: []
- created_by, associated_transaction

=== Products ===
Product catalog.
Key fields:
- _id, name, sku
- category_id (ref to Categories), subcategory_id, brand_id
- unit, gst_rate, cess, hsn
- min_price, max_price
- is_active, status_cd: "approved" | "pending" | "rejected"
- margin_expectation: { min, max }
- created_date, updated_date, updated_by

=== ProofOfDeliveries ===
POD records for delivered goods.
Key fields:
- _id, number, invc_number, vehicle_number
- po_id, invc_id
- date, created_date
- status_cd: "received" | "pending" | "partial"
- status: "Received" | "Pending" | "Partial"
- total_amount, total_tax
- lineitems: [{ name, qty, unit, rate, amount }]
- remarks, files
- created_by, updated_by

=== PurchaseOrders ===
Purchase orders from buyers to sellers.
Key fields:
- _id, number, internal_number (e.g. PO-POSHN-xxx)
- buyer (ref to Organisations)
- date, expiry_date, delivery_date, created_date
- status_cd: "approved" | "pending" | "cancelled" | "completed" | "draft"
- status: "Approved" | "Pending" | "Cancelled" | "Completed" | "Draft"
- total_amount, total_tax, freight
- delivery_type: "FOR" | "Ex-Works"
- payment_terms (number of days as string)
- lineitems: [{ name, item_id, category_id, unit, gst, rate, qty, amount }]
- shipping_address, billing_address
- shipping_address_info: { city, state, pincode, shop_name }
- billing_address_info: { city, state, pincode, shop_name }
- owner, owner_name, creator: { name, email, role }
- approvers: [], files: [], rfq
- created_by, is_viewed_by_seller

=== Categories ===
Product categories.
Key fields:
- _id, name
- is_subcategory, parent_category_id
- is_active
- margin_expectation: { min, max }
- updated_date, updated_by

=== User (also serves as Organisations — same collection) ===
All platform participants — buyers, sellers, KAMs, admins, agents.
Key fields:
- _id, name, shop_name, trade_name, gstin, pan
- role: "seller" | "buyer" | "kam" | "admin" | "agent"
- role_title: "Seller" | "Buyer" (display version)
- phone, email, city, state, state_cd, pincode
- is_active, is_operational, is_internal_user
- application_status: "in_review" | "approved" | "rejected" | "pending"
- business_type: { name, code } e.g. "Private Limited Company"/"PVTLTD", "Sole Proprietorship"/"SP"
- credit_limit, min_net_sales_margin
- distribution_type: "wholesaler" | "retailer" | "distributor"
- business_channel: ["Smart"] | ["Non Smart"]
- bank_name, bank_ifsc, bank_account_number, bank_beneficiary_name
- tax_settings: { code, percentage, name, type }
- organisations: { _id, internal_number } (e.g. STSPL-O-1787)
- directors: [{ name, phone, pan, is_primary, credit_score }]
- background_check: { legal_cases, negative_due_diligence, direct_indirect_grade }
- consent: { terms_and_conditions_privacy, whatsapp_consent }
- is_gst_registered, is_msme_registered, is_trade_msme
- fssai, fssai_expiration_date
- incorporation_date, registration_date, created_date, updated_date
- credit_ratings: [], products: [], categories: []
- account_owner (ref to Users — KAM assigned), associated_agent
- po_applicable, po_file_applicable
- demand_broadcast
- timelines: [{ action_type, remarks, created_by_name, created_date }]

=== Invoices ===
Sales invoices raised against purchase orders.
Key fields:
- _id, number, invc_number, internal_number
- po_id, po_info, bill_id, seller
- date, invc_date, created_date, updated_date
- status_cd: "active" | "cancelled"   ← NOT "pending"
- status: "Active" | "Cancelled"
- stage_cd: "pending" | "completed" | "in_transit" | "delivered"  ← delivery stage
- stage: "Not Started" | "Completed" | "In Transit" | "Delivered"
- total_amount, total_tax, freight
- have_addl_bills, addl_bills
- dispatch_address, shipping_address, billing_address
- lineitems: [{ name, item_id, unit, gst, rate, qty, amount }]
- tcs: { code, percentage, amount }
- vehicle_number, remarks
- created_by

NOTE: To find buyers use: { role: "buyer" }
      To find sellers use: { role: "seller" }
      To find KAMs use: { role: "kam" }
      To search by name use shop_name or name field with regex

IMPORTANT QUERY RULES:
1. All ObjectId fields (like _id, po_id, seller, buyer) cannot be used in text searches — skip them unless user provides exact ID
2. For date queries always use $gte and $lte with ISO date strings
3. For status queries use status_cd (lowercase) not status (display text)
4. Collection names are case-sensitive — use exact names as listed above
5. For amount/financial summaries prefer aggregation pipelines with $group and $sum
6. For cross-collection data (e.g. bill with PO details) note that po_info is embedded in most documents so no need to join
7. buyer_name and seller_info.shop_name are the main text fields for vendor/customer search
`;

async function queryCollection(collectionName, mongoQuery, sort, limit = 50) {
  if (!ALLOWED_COLLECTIONS.includes(collectionName)) {
    throw new Error(`Collection "${collectionName}" is not accessible`);
  }

  const db = mongoose.connection.db;
  const collection = db.collection(collectionName);

  const results = await collection
    .find(mongoQuery)
    .sort(sort || { _id: -1 })
    .limit(limit)
    .toArray();
  console.log(
    `Queried "${collectionName}" with:`,
    JSON.stringify(mongoQuery),
    `\nResults: ${results}`
  );
  return results;
}

async function aggregateCollection(collectionName, pipeline) {
  console.log(
    `Running aggregation on "${collectionName}" with pipeline:`,
    JSON.stringify(pipeline, null, 2)
  );
  if (!ALLOWED_COLLECTIONS.includes(collectionName)) {
    throw new Error(`Collection "${collectionName}" is not accessible`);
  }

  const db = mongoose.connection.db;
  const collection = db.collection(collectionName);

  return await collection.aggregate(pipeline).toArray();
}

async function countDocuments(collectionName, mongoQuery) {
  if (!ALLOWED_COLLECTIONS.includes(collectionName)) {
    throw new Error(`Collection "${collectionName}" is not accessible`);
  }

  const db = mongoose.connection.db;
  const collection = db.collection(collectionName);

  return await collection.countDocuments(mongoQuery);
}

module.exports = {
  queryCollection,
  aggregateCollection,
  countDocuments,
  SCHEMA_DESCRIPTION,
  ALLOWED_COLLECTIONS,
};
