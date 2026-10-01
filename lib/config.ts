// The CRM's WhatsApp number, which the WhatsApp bot answers. The chat bubble's
// WhatsApp button and its fallback link both open it.
const whatsappNumber =
  process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || '919000720003';

export const siteConfig = {
  name: 'Hope Trust India',
  url: process.env.NEXT_PUBLIC_SITE_URL || 'https://hopetrustindia.com',

  contact: {
    email: 'frontoffice@hopetrustindia.com',
    trainingEmail: 'training@hopetrustindia.com',
    phone: '+91 9000850001',
    phone2: '+91 9000720003',
    trainingPhone: '+91 9866822240',
    whatsappUrl: `https://wa.me/${whatsappNumber}`,
    address: {
      line1: 'C/o, UCCHVAS Rehabilitation Center,',
      line2: 'Plot no. 564-A-36-111,',
      line3: 'Opp. Lotus Pond Road, MLA Colony,',
      line4: 'Banjara Hills, Hyderabad \u2013 500034',
      full: 'C/o, UCCHVAS Rehabilitation Center, Plot no. 564-A-36-111, Opp. Lotus Pond Road, MLA Colony, Banjara Hills, Hyderabad-500034.',
      mapsUrl:
        'https://www.google.com/maps/dir/?api=1&destination=UCCHVAS+Rehabilitation+Center+Banjara+Hills+Hyderabad',
      // Structured parts for schema.org PostalAddress. Keep in sync with the
      // Google Business Profile — NAP mismatches weaken local ranking signals.
      streetAddress:
        'C/o UCCHVAS Rehabilitation Center, Plot no. 564-A-36-111, Opp. Lotus Pond Road, MLA Colony, Banjara Hills',
      locality: 'Hyderabad',
      region: 'Telangana',
      postalCode: '500034',
      country: 'IN',
    },
  },

  /**
   * Single source of truth for opening hours. These must match the visible
   * text on /contact/, the JSON-LD, and the Google Business Profile.
   */
  hours: {
    days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    opens: '10:00',
    closes: '19:00',
    display: '10 AM – 7 PM (IST)',
    displayDays: 'Monday to Saturday',
  },

  maps: {
    embedUrl:
      process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_URL ||
      'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3806.949020975297!2d78.41910637493538!3d17.4142339834775!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3bcb96c4df21349b%3A0x87e33358daa3586e!2sHope%20Trust%20-%20Psychological%20Wellness%20Centre!5e0!3m2!1sen!2sin!4v1775025408028!5m2!1sen!2sin',
  },
};
