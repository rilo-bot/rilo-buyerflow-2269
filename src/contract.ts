/**
 * AUTO-GENERATED — DO NOT EDIT.
 * This is the shared API contract for this app, regenerated from the plan on
 * every build. Both the frontend (@/contract) and the backend (./contract)
 * import these types so the request/response shapes can never drift.
 */


export interface Agent {
  /** Unique agent ID */
  id: string;
  /** Agent's email address */
  email: string;
  /** Agent's full name */
  name?: string;
  /** Agent's phone number */
  phone?: string;
  /** Agency name */
  agency?: string;
  /** Receive email alerts on offer status changes */
  notifyOnOffer: boolean;
  /** ISO timestamp of account creation */
  createdAt: string;
}

export interface OtpCode {
  /** Unique OTP record ID */
  id: string;
  /** Email address the code was sent to */
  email: string;
  /** The 6-digit one-time code */
  code: string;
  /** ISO timestamp when the code expires */
  expiresAt: string;
  /** ISO timestamp of code creation */
  createdAt: string;
}

export interface Buyer {
  /** Unique buyer ID */
  id: string;
  /** Owning agent ID */
  agentId: string;
  /** Buyer's full name */
  name: string;
  /** Buyer's email */
  email?: string;
  /** Buyer's phone */
  phone?: string;
  /** Minimum budget in dollars */
  budgetMin: number;
  /** Maximum budget in dollars */
  budgetMax: number;
  /** List of preferred suburb names */
  preferredSuburbs: string[];
  /** Preferred property types e.g. house, apartment */
  propertyTypes: string[];
  /** Minimum bedrooms required */
  bedroomsMin?: number;
  /** Minimum bathrooms required */
  bathroomsMin?: number;
  /** Must-have features e.g. garage, pool */
  mustHaveFeatures: string[];
  /** Current buyer status */
  status: 'active' | 'paused' | 'settled';
  /** Free-text notes about the buyer */
  notes?: string;
  /** ISO creation timestamp */
  createdAt: string;
  /** ISO last-updated timestamp */
  updatedAt: string;
}

export interface Property {
  /** Unique property ID */
  id: string;
  /** Owning agent ID */
  agentId: string;
  /** Full street address */
  address: string;
  /** Suburb name */
  suburb: string;
  /** State abbreviation */
  state: string;
  /** Postcode */
  postcode: string;
  /** Listing price in dollars */
  price?: number;
  /** Type: house, apartment, townhouse, etc. */
  propertyType: string;
  /** Number of bedrooms */
  bedrooms?: number;
  /** Number of bathrooms */
  bathrooms?: number;
  /** Property features e.g. garage, pool */
  features: string[];
  /** Current listing status */
  status: 'active' | 'under-offer' | 'sold' | 'passed-in';
  /** External listing URL */
  listingUrl?: string;
  /** Agent notes about the property */
  notes?: string;
  /** ISO creation timestamp */
  createdAt: string;
  /** ISO last-updated timestamp */
  updatedAt: string;
}

export interface Inspection {
  /** Unique inspection ID */
  id: string;
  /** Owning agent ID */
  agentId: string;
  /** Buyer attending the inspection */
  buyerId: string;
  /** Property being inspected */
  propertyId: string;
  /** ISO datetime of the inspection */
  scheduledAt: string;
  /** Inspection status */
  status: 'scheduled' | 'completed' | 'cancelled';
  /** Notes from the inspection */
  notes?: string;
  /** Buyer's reaction or feedback */
  buyerFeedback?: string;
  /** ISO creation timestamp */
  createdAt: string;
}

export interface Offer {
  /** Unique offer ID */
  id: string;
  /** Owning agent ID */
  agentId: string;
  /** Buyer making the offer */
  buyerId: string;
  /** Property being offered on */
  propertyId: string;
  /** Offer amount in dollars */
  amount: number;
  /** Current offer status */
  status: 'submitted' | 'countered' | 'accepted' | 'rejected' | 'withdrawn';
  /** Offer conditions e.g. subject to finance */
  conditions: string[];
  /** ISO datetime the offer expires */
  expiresAt?: string;
  /** Agent notes about the offer */
  notes?: string;
  /** ISO creation timestamp */
  createdAt: string;
  /** ISO last-updated timestamp */
  updatedAt: string;
}

export interface Contract {
  /** Unique contract ID */
  id: string;
  /** Owning agent ID */
  agentId: string;
  /** The accepted offer this contract stems from */
  offerId: string;
  /** Buyer on the contract */
  buyerId: string;
  /** Property under contract */
  propertyId: string;
  /** ISO date contracts were exchanged */
  exchangeDate?: string;
  /** ISO date finance condition must be satisfied */
  financeDate?: string;
  /** ISO date building inspection condition due */
  buildingInspectionDate?: string;
  /** ISO scheduled settlement date */
  settlementDate?: string;
  /** Current contract status */
  status: 'exchanged' | 'unconditional' | 'settled' | 'fallen-over';
  /** Final agreed purchase price */
  purchasePrice: number;
  /** Agent notes about the contract */
  notes?: string;
  /** ISO creation timestamp */
  createdAt: string;
  /** ISO last-updated timestamp */
  updatedAt: string;
}

export interface Commission {
  /** Unique commission ID */
  id: string;
  /** Owning agent ID */
  agentId: string;
  /** Related contract ID */
  contractId: string;
  /** Related buyer ID */
  buyerId: string;
  /** Related property ID */
  propertyId: string;
  /** Expected commission in dollars */
  expectedAmount: number;
  /** Amount actually received */
  receivedAmount?: number;
  /** Payment status */
  status: 'pending' | 'partial' | 'received' | 'overdue';
  /** ISO date commission is due */
  dueDate?: string;
  /** ISO date commission was received */
  receivedDate?: string;
  /** Notes about this commission */
  notes?: string;
  /** ISO creation timestamp */
  createdAt: string;
  /** ISO last-updated timestamp */
  updatedAt: string;
}

export interface ApiContract {
  "auth-request-code": { method: "POST"; path: "/api/auth/request-code"; request: { email: string }; response: { ok: boolean } };
  "auth-verify-code": { method: "POST"; path: "/api/auth/verify-code"; request: { email: string; code: string }; response: { token: string; user: Agent } };
  "auth-me": { method: "GET"; path: "/api/auth/me"; request: void; response: Agent };
  "update-agent": { method: "PATCH"; path: "/api/auth/me"; request: Partial<Omit<Agent, 'id' | 'createdAt'>>; response: Agent };
  "list-buyers": { method: "GET"; path: "/api/buyers"; request: void; response: Buyer[] };
  "create-buyer": { method: "POST"; path: "/api/buyers"; request: Omit<Buyer, 'id' | 'agentId' | 'createdAt' | 'updatedAt'>; response: Buyer };
  "get-buyer": { method: "GET"; path: "/api/buyers/:id"; request: void; response: Buyer };
  "update-buyer": { method: "PATCH"; path: "/api/buyers/:id"; request: Partial<Omit<Buyer, 'id' | 'agentId' | 'createdAt'>>; response: Buyer };
  "delete-buyer": { method: "DELETE"; path: "/api/buyers/:id"; request: void; response: { ok: boolean } };
  "match-buyers": { method: "GET"; path: "/api/properties/:id/matches"; request: void; response: Buyer[] };
  "list-properties": { method: "GET"; path: "/api/properties"; request: void; response: Property[] };
  "create-property": { method: "POST"; path: "/api/properties"; request: Omit<Property, 'id' | 'agentId' | 'createdAt' | 'updatedAt'>; response: Property };
  "get-property": { method: "GET"; path: "/api/properties/:id"; request: void; response: Property };
  "update-property": { method: "PATCH"; path: "/api/properties/:id"; request: Partial<Omit<Property, 'id' | 'agentId' | 'createdAt'>>; response: Property };
  "delete-property": { method: "DELETE"; path: "/api/properties/:id"; request: void; response: { ok: boolean } };
  "list-inspections": { method: "GET"; path: "/api/inspections"; request: void; response: Inspection[] };
  "create-inspection": { method: "POST"; path: "/api/inspections"; request: Omit<Inspection, 'id' | 'agentId' | 'createdAt'>; response: Inspection };
  "update-inspection": { method: "PATCH"; path: "/api/inspections/:id"; request: Partial<Omit<Inspection, 'id' | 'agentId' | 'createdAt'>>; response: Inspection };
  "delete-inspection": { method: "DELETE"; path: "/api/inspections/:id"; request: void; response: { ok: boolean } };
  "list-offers": { method: "GET"; path: "/api/offers"; request: void; response: Offer[] };
  "create-offer": { method: "POST"; path: "/api/offers"; request: Omit<Offer, 'id' | 'agentId' | 'createdAt' | 'updatedAt'>; response: Offer };
  "get-offer": { method: "GET"; path: "/api/offers/:id"; request: void; response: Offer };
  "update-offer": { method: "PATCH"; path: "/api/offers/:id"; request: Partial<Omit<Offer, 'id' | 'agentId' | 'createdAt'>>; response: Offer };
  "list-contracts": { method: "GET"; path: "/api/contracts"; request: void; response: Contract[] };
  "create-contract": { method: "POST"; path: "/api/contracts"; request: Omit<Contract, 'id' | 'agentId' | 'createdAt' | 'updatedAt'>; response: Contract };
  "get-contract": { method: "GET"; path: "/api/contracts/:id"; request: void; response: Contract };
  "update-contract": { method: "PATCH"; path: "/api/contracts/:id"; request: Partial<Omit<Contract, 'id' | 'agentId' | 'createdAt'>>; response: Contract };
  "list-commissions": { method: "GET"; path: "/api/commissions"; request: void; response: Commission[] };
  "create-commission": { method: "POST"; path: "/api/commissions"; request: Omit<Commission, 'id' | 'agentId' | 'createdAt' | 'updatedAt'>; response: Commission };
  "update-commission": { method: "PATCH"; path: "/api/commissions/:id"; request: Partial<Omit<Commission, 'id' | 'agentId' | 'createdAt'>>; response: Commission };
  "get-dashboard-stats": { method: "GET"; path: "/api/dashboard/stats"; request: void; response: { activeBuyers: number; pendingOffers: number; upcomingInspections: number; openContracts: number; commissionExpected: number; commissionReceived: number } };
}

export const API_ROUTES = {
  "auth-request-code": { method: "POST", path: "/api/auth/request-code" },
  "auth-verify-code": { method: "POST", path: "/api/auth/verify-code" },
  "auth-me": { method: "GET", path: "/api/auth/me" },
  "update-agent": { method: "PATCH", path: "/api/auth/me" },
  "list-buyers": { method: "GET", path: "/api/buyers" },
  "create-buyer": { method: "POST", path: "/api/buyers" },
  "get-buyer": { method: "GET", path: "/api/buyers/:id" },
  "update-buyer": { method: "PATCH", path: "/api/buyers/:id" },
  "delete-buyer": { method: "DELETE", path: "/api/buyers/:id" },
  "match-buyers": { method: "GET", path: "/api/properties/:id/matches" },
  "list-properties": { method: "GET", path: "/api/properties" },
  "create-property": { method: "POST", path: "/api/properties" },
  "get-property": { method: "GET", path: "/api/properties/:id" },
  "update-property": { method: "PATCH", path: "/api/properties/:id" },
  "delete-property": { method: "DELETE", path: "/api/properties/:id" },
  "list-inspections": { method: "GET", path: "/api/inspections" },
  "create-inspection": { method: "POST", path: "/api/inspections" },
  "update-inspection": { method: "PATCH", path: "/api/inspections/:id" },
  "delete-inspection": { method: "DELETE", path: "/api/inspections/:id" },
  "list-offers": { method: "GET", path: "/api/offers" },
  "create-offer": { method: "POST", path: "/api/offers" },
  "get-offer": { method: "GET", path: "/api/offers/:id" },
  "update-offer": { method: "PATCH", path: "/api/offers/:id" },
  "list-contracts": { method: "GET", path: "/api/contracts" },
  "create-contract": { method: "POST", path: "/api/contracts" },
  "get-contract": { method: "GET", path: "/api/contracts/:id" },
  "update-contract": { method: "PATCH", path: "/api/contracts/:id" },
  "list-commissions": { method: "GET", path: "/api/commissions" },
  "create-commission": { method: "POST", path: "/api/commissions" },
  "update-commission": { method: "PATCH", path: "/api/commissions/:id" },
  "get-dashboard-stats": { method: "GET", path: "/api/dashboard/stats" },
} as const;
