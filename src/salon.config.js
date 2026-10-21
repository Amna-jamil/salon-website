/**
 * YOUR SALON STARTS HERE
 * Replace the demo content, then set demoMode: false.
 * Photos live in public/images; paths start with /images/.
 * Empty optional contact/address/social values hide their links automatically.
 * WhatsApp uses international digits only, without a leading + or spaces.
 */
export const salon = {
  demoMode: true,
  name: "Luma",
  tagline: "HAIR · SKIN · BEAUTY",
  logo: "", // Optional image path; leave empty for the text wordmark.
  favicon: "/favicon.svg",
  locale: "en-US",
  currency: "USD",
  currencyLabel: "USD",
  timeZone: "America/New_York", // IANA timezone of the salon, used for appointment dates.
  website: "", // Your full production URL, e.g. https://your-salon.com
  seo: {
    title: "Luma — A little care. A whole new kind of glow.",
    description:
      "Meet Luma, a fictional beauty studio for hair, skin, nails and makeup. Explore sample services and try our appointment demo.",
  },
  theme: {
    background: "#faf8f4",
    surface: "#ffffff",
    ink: "#382335",
    muted: "#756b71",
    accent: "#e5d9ec",
    accentSoft: "#f0eaf3",
    line: "#ded7d8",
  },
  hero: {
    eyebrow: "A BEAUTIFUL MOMENT, JUST FOR YOU",
    title: ["A little care.", "A whole new", "kind of glow."],
    description:
      "Good hair days. A softer pace. A little more you. Discover thoughtful beauty rituals that make room for feeling your best.",
    image: "/images/hero.jpg",
    imageAlt: "Soft brunette waves with a natural, glossy finish",
    detailImage: "/images/interior.jpg",
    detailAlt: "A bright salon with large windows, mirrors and styling chairs",
  },
  about: {
    eyebrow: "BEAUTY, AT YOUR OWN PACE",
    title: "Come as you are.\nLeave feeling like you.",
    description:
      "Luma is an imagined neighborhood beauty studio, created around a simple idea: taking care of yourself should feel as lovely as the result.",
    detail:
      "From a fresh cut to a quiet skincare ritual, our approach is personal, unhurried and centered on what feels right for you. Consider this your invitation to slow down and settle in.",
    image: "/images/about.jpg",
    imageAlt: "A contemporary salon with deep green walls and round mirrors",
    values: [
      "Care that feels personal",
      "Space to slow down",
      "Beauty that feels like you",
    ],
  },
  services: [
    {
      id: "hair",
      name: "Hair",
      subtitle: "A fresh chapter, from root to tip.",
      image: "/images/hair.jpg",
      alt: "A portrait featuring full, softly defined natural curls",
      items: [
        { id: "cut", name: "Cut & finish", price: 55, duration: "60 min" },
        { id: "color", name: "Color refresh", price: 95, duration: "120 min" },
        {
          id: "blowdry",
          name: "Signature blowout",
          price: 40,
          duration: "45 min",
        },
      ],
    },
    {
      id: "skin",
      name: "Skin",
      subtitle: "A little pause. A luminous reset.",
      image: "/images/skin.jpg",
      alt: "A relaxing facial treatment with a soft brush",
      items: [
        {
          id: "facial",
          name: "Essential glow facial",
          price: 70,
          duration: "60 min",
        },
        {
          id: "hydration",
          name: "Hydration ritual",
          price: 85,
          duration: "75 min",
        },
        {
          id: "brows",
          name: "Brow shape & tidy",
          price: 20,
          duration: "20 min",
        },
      ],
    },
    {
      id: "nails",
      name: "Nails",
      subtitle: "The smallest details. All the difference.",
      image: "/images/nails.jpg",
      alt: "A close-up of carefully polished nails",
      items: [
        {
          id: "manicure",
          name: "Classic manicure",
          price: 30,
          duration: "45 min",
        },
        { id: "gel", name: "Gel manicure", price: 45, duration: "60 min" },
        {
          id: "pedicure",
          name: "Rest & reset pedicure",
          price: 50,
          duration: "60 min",
        },
      ],
    },
    {
      id: "makeup",
      name: "Makeup",
      subtitle: "Your beauty, in a different light.",
      image: "/images/makeup.jpg",
      alt: "A makeup artist applying pink-toned occasion makeup",
      items: [
        {
          id: "soft-glam",
          name: "Soft occasion makeup",
          price: 80,
          duration: "60 min",
        },
        { id: "event", name: "Evening glow", price: 100, duration: "75 min" },
        {
          id: "bridal",
          name: "Bridal consultation",
          price: 35,
          duration: "30 min",
        },
      ],
    },
  ],
  gallery: [
    {
      image: "/images/hair.jpg",
      alt: "Full natural curls against a soft pink background",
      label: "Beautiful texture",
      category: "Hair",
    },
    {
      image: "/images/nails.jpg",
      alt: "A delicate polished manicure",
      label: "The finishing touch",
      category: "Nails",
    },
    {
      image: "/images/makeup.jpg",
      alt: "Pink-toned occasion makeup in progress",
      label: "An occasion glow",
      category: "Makeup",
    },
    {
      image: "/images/skin.jpg",
      alt: "A calming skincare treatment",
      label: "Time to reset",
      category: "Skin",
    },
  ],
  reviews: [
    {
      quote:
        "The kind of place where you can take a breath, settle into the chair, and enjoy a little time for yourself.",
      name: "Demo guest 01",
      service: "Hair appointment",
    },
    {
      quote:
        "I loved the thoughtful little details. My skin felt refreshed, and the whole experience felt wonderfully calm.",
      name: "Demo guest 02",
      service: "Skincare ritual",
    },
    {
      quote:
        "A beautiful little reset before a busy week. Exactly the sort of self-care moment I had in mind.",
      name: "Demo guest 03",
      service: "Nail appointment",
    },
  ],
  branches: [
    {
      id: "garden",
      name: "The Garden Studio",
      label: "YOUR NEIGHBORHOOD PAUSE",
      description:
        "An imagined light-filled studio with soft textures and a slower pace.",
      address: "",
      mapUrl: "",
      phone: "",
      image: "/images/interior.jpg",
      imageAlt: "Bright styling stations in an airy salon",
      hours: [
        { days: "Tuesday – Saturday", time: "10:00 AM – 7:00 PM" },
        { days: "Sunday", time: "11:00 AM – 5:00 PM" },
        { days: "Monday", time: "Closed" },
      ],
      seoAddress: null,
    },
    {
      id: "atelier",
      name: "The City Atelier",
      label: "A LITTLE CALM IN THE CITY",
      description:
        "An imagined intimate beauty space for everyday rituals and special occasions.",
      address: "",
      mapUrl: "",
      phone: "",
      image: "/images/about.jpg",
      imageAlt: "A contemporary salon with deep green walls and round mirrors",
      hours: [
        { days: "Tuesday – Saturday", time: "10:00 AM – 7:00 PM" },
        { days: "Sunday", time: "11:00 AM – 5:00 PM" },
        { days: "Monday", time: "Closed" },
      ],
      seoAddress: null,
    },
  ],
  contact: {
    phone: "+1 (202) 555-0147", // Reserved fictional demo number. Replace before launch.
    whatsappNumber: "12025550147", // International digits only. Replace before launch.
    email: "",
    socials: [
      { label: "Instagram", url: "" },
      { label: "Facebook", url: "" },
    ],
    hours: [
      { days: "Tuesday – Saturday", time: "10:00 AM – 7:00 PM" },
      { days: "Sunday", time: "11:00 AM – 5:00 PM" },
      { days: "Monday", time: "Closed" },
    ],
  },
  booking: {
    introduction:
      "A fresh look or a familiar ritual. Let’s make a little time for you.",
    whatsappGreeting: "Hello! I would like to enquire about an appointment at",
  },
};
