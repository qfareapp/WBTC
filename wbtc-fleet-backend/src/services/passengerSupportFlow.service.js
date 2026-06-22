const SUPPORT_TREE = {
  root: {
    id: "root",
    title: "QFare Support",
    message:
      "Tell us what you need help with. Choose the option that matches your issue.",
    helperText: "You can continue with guided support or switch to WhatsApp anytime.",
    allowEscalation: true,
    recentBookingScope: "all",
    options: [
      {
        id: "booking_issue",
        label: "Booking issue",
        description: "Ticket missing, wrong stop selected, or route-related booking trouble.",
        nextNodeId: "booking_issue",
      },
      {
        id: "payment_issue",
        label: "Payment issue",
        description: "Money debited, refund pending, or payment verification problem.",
        nextNodeId: "payment_issue",
      },
      {
        id: "account_issue",
        label: "Account or profile issue",
        description: "Login trouble, phone/address updates, or passenger profile questions.",
        nextNodeId: "account_issue",
      },
    ],
  },
  booking_issue: {
    id: "booking_issue",
    title: "Booking issue",
    message: "Pick the booking problem you are facing.",
    allowEscalation: true,
    recentBookingScope: "all",
    options: [
      {
        id: "ticket_not_received",
        label: "Ticket not received",
        description: "Payment completed but the ticket did not appear.",
        nextNodeId: "ticket_not_received",
      },
      {
        id: "wrong_stop_or_route",
        label: "Wrong stop or route selected",
        description: "You selected the wrong boarding or destination stop.",
        nextNodeId: "wrong_stop_or_route",
      },
      {
        id: "booking_id_help",
        label: "How to share booking details",
        description: "Need to know what info support needs from you.",
        nextNodeId: "booking_id_help",
      },
    ],
  },
  payment_issue: {
    id: "payment_issue",
    title: "Payment issue",
    message: "Choose the payment issue you need help with.",
    allowEscalation: true,
    recentBookingScope: "payments",
    options: [
      {
        id: "money_debited_no_ticket",
        label: "Money debited but no ticket",
        description: "Amount was deducted but booking is missing.",
        nextNodeId: "money_debited_no_ticket",
      },
      {
        id: "refund_status",
        label: "Refund status",
        description: "You are waiting for a reversal or refund update.",
        nextNodeId: "refund_status",
      },
      {
        id: "duplicate_charge",
        label: "Duplicate or extra charge",
        description: "The same booking or payment seems charged more than once.",
        nextNodeId: "duplicate_charge",
      },
    ],
  },
  account_issue: {
    id: "account_issue",
    title: "Account or profile issue",
    message: "Choose the account or profile issue you need help with.",
    allowEscalation: true,
    options: [
      {
        id: "login_issue",
        label: "Login or OTP issue",
        description: "OTP not received or trouble signing in.",
        nextNodeId: "login_issue",
      },
      {
        id: "update_contact_info",
        label: "Update mobile or address",
        description: "Need help updating profile contact information.",
        nextNodeId: "update_contact_info",
      },
      {
        id: "favorites_or_app_issue",
        label: "App or favourites issue",
        description: "Saved favourites or app behavior is not working as expected.",
        nextNodeId: "favorites_or_app_issue",
      },
    ],
  },
  ticket_not_received: {
    id: "ticket_not_received",
    title: "Ticket not received",
    message:
      "First, open Profile > Live Tickets and pull to refresh once. If the ticket still does not appear, contact support and include your booking ID, route, payment time, and registered email.",
    helperText: "Escalate if the ticket is still missing after one refresh.",
    allowEscalation: true,
    recentBookingScope: "all",
    resolutionHints: ["Refresh Live Tickets once", "Keep booking/payment details ready"],
    options: [],
  },
  wrong_stop_or_route: {
    id: "wrong_stop_or_route",
    title: "Wrong stop or route selected",
    message:
      "If the booking is not yet used, contact support immediately with your booking ID and the correct source/destination details. Include what you selected and what you intended to select.",
    allowEscalation: true,
    recentBookingScope: "all",
    resolutionHints: ["Share booking ID", "Mention correct and incorrect stop details"],
    options: [],
  },
  booking_id_help: {
    id: "booking_id_help",
    title: "How to share booking details",
    message:
      "For faster help, share: booking ID, route code, bus number if visible, travel date, payment time, and your registered QFare email or passenger ID.",
    allowEscalation: true,
    recentBookingScope: "all",
    resolutionHints: ["Booking ID", "Route code", "Travel date and payment time"],
    options: [],
  },
  money_debited_no_ticket: {
    id: "money_debited_no_ticket",
    title: "Money debited but no ticket",
    message:
      "Please wait a short while and refresh your Live Tickets once. If the ticket is still missing, contact support with your payment reference, amount, time of payment, and passenger ID.",
    allowEscalation: true,
    recentBookingScope: "payments",
    resolutionHints: ["Refresh once", "Keep payment reference and amount ready"],
    options: [],
  },
  refund_status: {
    id: "refund_status",
    title: "Refund status",
    message:
      "Refund timing depends on the payment provider and bank. Contact support with your booking ID or payment reference if the refund has not appeared within the expected bank settlement time.",
    allowEscalation: true,
    recentBookingScope: "payments",
    resolutionHints: ["Share booking ID or payment reference", "Mention when the charge happened"],
    options: [],
  },
  duplicate_charge: {
    id: "duplicate_charge",
    title: "Duplicate or extra charge",
    message:
      "Contact support with both transaction references, the charged amounts, and your passenger ID. This helps the team verify whether one payment failed or both were captured.",
    allowEscalation: true,
    recentBookingScope: "payments",
    resolutionHints: ["Share both transaction references", "Mention both charged amounts"],
    options: [],
  },
  login_issue: {
    id: "login_issue",
    title: "Login or OTP issue",
    message:
      "Check that you are using the same registered email address. If the OTP still does not arrive, contact support and mention the email, the approximate time you requested the OTP, and whether the issue is repeatable.",
    allowEscalation: true,
    resolutionHints: ["Confirm registered email", "Mention OTP request time"],
    options: [],
  },
  update_contact_info: {
    id: "update_contact_info",
    title: "Update mobile or address",
    message:
      "You can update mobile number and address directly from the Profile screen. Use the Edit button inside Contact details, then save the updated information.",
    allowEscalation: true,
    resolutionHints: ["Profile > Contact details > Edit"],
    options: [],
  },
  favorites_or_app_issue: {
    id: "favorites_or_app_issue",
    title: "App or favourites issue",
    message:
      "If favourites, saved settings, or another in-app feature is not behaving correctly, contact support and describe the exact screen, the steps you took, and whether reopening the app changes the behavior.",
    allowEscalation: true,
    resolutionHints: ["Mention the exact screen", "Describe the steps to reproduce"],
    options: [],
  },
};

const ROOT_NODE_ID = "root";

function cloneNode(node) {
  return {
    ...node,
    options: Array.isArray(node.options) ? node.options.map(option => ({ ...option })) : [],
    resolutionHints: Array.isArray(node.resolutionHints) ? [...node.resolutionHints] : [],
  };
}

function getSupportNode(nodeId) {
  const resolvedId = String(nodeId || ROOT_NODE_ID).trim() || ROOT_NODE_ID;
  const node = SUPPORT_TREE[resolvedId] || SUPPORT_TREE[ROOT_NODE_ID];
  return cloneNode(node);
}

module.exports = {
  ROOT_NODE_ID,
  getSupportNode,
};
