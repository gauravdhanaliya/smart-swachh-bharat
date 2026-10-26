// Content for the citizen "Eco Guide" (opened from the "Small Actions, Make a
// Big Difference" banner on Citizen Home). Plain data so the copy can be
// edited without touching the page component.
//
// `art` picks the illustration in components/EcoIllustration.jsx.
// `groups` (optional) renders colour-coded "what goes where" cards.

export const ECO_TOPICS = [
  {
    id: "segregate",
    label: "Segregate",
    emoji: "🗂️",
    art: "segregation",
    title: "Segregate waste at source",
    summary:
      "Keeping wet, dry and hazardous waste apart at home is the single most useful habit. Clean, separated waste can be composted or recycled instead of ending up in a landfill.",
    groups: [
      {
        name: "Green bin · Wet waste",
        color: "green",
        examples: ["Vegetable & fruit peels", "Leftover food", "Tea leaves, coffee grounds", "Flowers & garden leaves"],
      },
      {
        name: "Blue bin · Dry waste",
        color: "blue",
        examples: ["Paper & cardboard", "Plastic bottles & wrappers", "Glass & metal cans", "Cloth & rubber"],
      },
      {
        name: "Black bin · Hazardous",
        color: "slate",
        examples: ["Batteries & bulbs", "Expired medicines", "Paint & chemical tins", "Sanitary waste (wrap it first)"],
      },
    ],
    steps: [
      "Keep two or three small bins in the kitchen and label them.",
      "Rinse and dry plastic, tins and bottles before they go in the dry bin.",
      "Never mix wet waste with dry waste — it spoils both.",
      "Hand waste to the collection vehicle separated, at the usual time.",
    ],
    fact:
      "Clean, dry recyclables are worth far more to recyclers and waste pickers than the same items soaked in food waste.",
  },
  {
    id: "compost",
    label: "Compost",
    emoji: "🌱",
    art: "compost",
    title: "Turn kitchen waste into compost",
    summary:
      "Wet waste is nearly half of what most households throw away. Composting turns it into soil food for plants and keeps it out of overflowing bins.",
    steps: [
      "Use a pot, bucket or terracotta composter with small air holes.",
      "Add kitchen scraps and cover each layer with dry leaves or a handful of soil.",
      "Keep it damp, not soggy, and stir once a week.",
      "In a few weeks you get dark, crumbly compost for your plants.",
      "Avoid adding cooked oily food, meat and dairy in a home composter — they smell and attract pests.",
    ],
    fact:
      "Food waste that rots in a landfill has no air, so it releases methane — a greenhouse gas far stronger than carbon dioxide.",
  },
  {
    id: "plastic",
    label: "Plastic-free",
    emoji: "🛍️",
    art: "plastic",
    title: "Say no to single-use plastic",
    summary:
      "Thin plastic bags, cups and straws are used for minutes but last for years. Small swaps at home and in the market add up across a whole city.",
    steps: [
      "Keep a cloth bag in your bag, scooter or car so you never need a carry bag.",
      "Carry your own water bottle and a steel tiffin or container for takeaway.",
      "Choose paper, steel or glass over disposable cups, plates and straws.",
      "Never throw plastic in drains or open ground — always use a dry-waste bin.",
    ],
    fact:
      "Plastic bags choke drains, which makes waterlogging worse in the rains, and animals often swallow them by mistake.",
  },
  {
    id: "water",
    label: "Save water",
    emoji: "💧",
    art: "water",
    title: "Save every drop",
    summary:
      "Clean water is limited and pumping and treating it uses energy. Most savings come from small daily habits.",
    steps: [
      "Turn the tap off while brushing, shaving or soaping.",
      "Fix leaking taps and pipes quickly — a slow drip wastes many litres in a day.",
      "Use a bucket instead of a running hose to wash vehicles and floors.",
      "Reuse water from washing vegetables or rice for plants.",
      "Collect rainwater where you can.",
    ],
    fact: "A tap that drips steadily can waste many litres of clean water every single day.",
  },
  {
    id: "energy",
    label: "Save energy",
    emoji: "💡",
    art: "energy",
    title: "Use less energy",
    summary:
      "Most electricity still comes from burning fuel. Using less at home cuts your bill and cuts pollution.",
    steps: [
      "Switch off lights, fans and chargers when you leave a room.",
      "Replace old bulbs with LEDs — same light for much less power.",
      "Prefer daylight and natural ventilation when possible.",
      "Walk, cycle, carpool or use public transport for short trips.",
    ],
    fact: "LED bulbs give the same light as old bulbs while using much less electricity, and they last longer.",
  },
  {
    id: "green",
    label: "Go green",
    emoji: "🌳",
    art: "trees",
    title: "Grow and protect greenery",
    summary:
      "Trees cool our neighbourhoods, clean the air and give birds and insects a home. Every plant counts, even on a balcony.",
    steps: [
      "Plant a sapling suited to your area during the monsoon and look after it.",
      "Grow herbs or flowering plants in pots on a balcony or window.",
      "Use compost instead of chemical fertiliser.",
      "Do not burn leaves or waste — take them to a wet-waste bin or compost them.",
    ],
    fact: "A street lined with trees is noticeably cooler in summer because of shade and the water vapour leaves release.",
  },
];

// Short one-liners; the page shows one per day.
export const ECO_TIPS = [
  "Carry a cloth bag today — say no to a plastic carry bag.",
  "Put peels and food scraps in the green bin, not with dry waste.",
  "Turn off the tap while you brush your teeth.",
  "Switch off lights and fans when you leave a room.",
  "Rinse and dry plastic and tins before putting them in the blue bin.",
  "Keep batteries and bulbs out of the normal bin — they are hazardous.",
  "Use a steel bottle instead of buying a plastic one.",
  "Plant or water one plant today.",
  "Walk or cycle for a short trip instead of taking the vehicle.",
  "Report an overflowing bin on the app so it is cleared sooner.",
];
