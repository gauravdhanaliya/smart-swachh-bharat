// All 28 states and 8 union territories of India, each with its capital
// and that capital's coordinates.
//
// Used by the Government Official Profile page: the officer picks a state,
// then a district / city inside it. The capital is always offered as a
// jurisdiction so every state has at least one option with real
// coordinates for re-centring the Dashboard map.
//
// This is deliberately separate from data/cities.js — CITIES drives the
// Citizen city picker and the demo facility dataset, and shouldn't grow
// just because the officer's state list did.

export const INDIAN_STATES = [
  // ---- States (28) ----
  { name: "Andhra Pradesh", type: "state", capital: "Amaravati", latitude: 16.573, longitude: 80.3575 },
  { name: "Arunachal Pradesh", type: "state", capital: "Itanagar", latitude: 27.0844, longitude: 93.6053 },
  { name: "Assam", type: "state", capital: "Dispur", latitude: 26.1433, longitude: 91.7898 },
  { name: "Bihar", type: "state", capital: "Patna", latitude: 25.5941, longitude: 85.1376 },
  { name: "Chhattisgarh", type: "state", capital: "Raipur", latitude: 21.2514, longitude: 81.6296 },
  { name: "Goa", type: "state", capital: "Panaji", latitude: 15.4909, longitude: 73.8278 },
  { name: "Gujarat", type: "state", capital: "Gandhinagar", latitude: 23.2156, longitude: 72.6369 },
  { name: "Haryana", type: "state", capital: "Chandigarh", latitude: 30.7333, longitude: 76.7794 },
  { name: "Himachal Pradesh", type: "state", capital: "Shimla", latitude: 31.1048, longitude: 77.1734 },
  { name: "Jharkhand", type: "state", capital: "Ranchi", latitude: 23.3441, longitude: 85.3096 },
  { name: "Karnataka", type: "state", capital: "Bengaluru", latitude: 12.9716, longitude: 77.5946 },
  { name: "Kerala", type: "state", capital: "Thiruvananthapuram", latitude: 8.5241, longitude: 76.9366 },
  { name: "Madhya Pradesh", type: "state", capital: "Bhopal", latitude: 23.2599, longitude: 77.4126 },
  { name: "Maharashtra", type: "state", capital: "Mumbai", latitude: 19.076, longitude: 72.8777 },
  { name: "Manipur", type: "state", capital: "Imphal", latitude: 24.817, longitude: 93.9368 },
  { name: "Meghalaya", type: "state", capital: "Shillong", latitude: 25.5788, longitude: 91.8933 },
  { name: "Mizoram", type: "state", capital: "Aizawl", latitude: 23.7271, longitude: 92.7176 },
  { name: "Nagaland", type: "state", capital: "Kohima", latitude: 25.6751, longitude: 94.1086 },
  { name: "Odisha", type: "state", capital: "Bhubaneswar", latitude: 20.2961, longitude: 85.8245 },
  { name: "Punjab", type: "state", capital: "Chandigarh", latitude: 30.7333, longitude: 76.7794 },
  { name: "Rajasthan", type: "state", capital: "Jaipur", latitude: 26.9124, longitude: 75.7873 },
  { name: "Sikkim", type: "state", capital: "Gangtok", latitude: 27.3389, longitude: 88.6065 },
  { name: "Tamil Nadu", type: "state", capital: "Chennai", latitude: 13.0827, longitude: 80.2707 },
  { name: "Telangana", type: "state", capital: "Hyderabad", latitude: 17.385, longitude: 78.4867 },
  { name: "Tripura", type: "state", capital: "Agartala", latitude: 23.8315, longitude: 91.2868 },
  { name: "Uttar Pradesh", type: "state", capital: "Lucknow", latitude: 26.8467, longitude: 80.9462 },
  { name: "Uttarakhand", type: "state", capital: "Dehradun", latitude: 30.3165, longitude: 78.0322 },
  { name: "West Bengal", type: "state", capital: "Kolkata", latitude: 22.5726, longitude: 88.3639 },

  // ---- Union Territories (8) ----
  { name: "Andaman and Nicobar Islands", type: "ut", capital: "Port Blair", latitude: 11.6234, longitude: 92.7265 },
  { name: "Chandigarh", type: "ut", capital: "Chandigarh", latitude: 30.7333, longitude: 76.7794 },
  { name: "Dadra and Nagar Haveli and Daman and Diu", type: "ut", capital: "Daman", latitude: 20.3974, longitude: 72.8328 },
  { name: "Delhi", type: "ut", capital: "New Delhi", latitude: 28.6139, longitude: 77.209 },
  { name: "Jammu and Kashmir", type: "ut", capital: "Srinagar", latitude: 34.0837, longitude: 74.7973 },
  { name: "Ladakh", type: "ut", capital: "Leh", latitude: 34.1526, longitude: 77.5771 },
  { name: "Lakshadweep", type: "ut", capital: "Kavaratti", latitude: 10.5667, longitude: 72.6417 },
  { name: "Puducherry", type: "ut", capital: "Puducherry", latitude: 11.9416, longitude: 79.8083 },
];

export const STATES_ONLY = INDIAN_STATES.filter((s) => s.type === "state");
export const UNION_TERRITORIES = INDIAN_STATES.filter((s) => s.type === "ut");
