import { useMemo, useState } from "react";

const faqSections = [
  {
    key: "driver",
    title: { en: "Driver FAQs", bn: "ড্রাইভার FAQ" },
    items: [
      {
        q: {
          en: "What is the driver app used for?",
          bn: "ড্রাইভার অ্যাপটি কী কাজে ব্যবহৃত হয়?",
        },
        a: {
          en: "The driver app is used to view assigned trips, start and complete trips, share live location, and follow route-related instructions during duty.",
          bn: "ড্রাইভার অ্যাপের মাধ্যমে নির্ধারিত ট্রিপ দেখা, ট্রিপ শুরু ও শেষ করা, লাইভ লোকেশন শেয়ার করা এবং ডিউটির সময় রুট সংক্রান্ত নির্দেশনা অনুসরণ করা যায়।",
        },
      },
      {
        q: {
          en: "Do I need to keep location enabled while driving?",
          bn: "গাড়ি চালানোর সময় কি লোকেশন অন রাখা বাধ্যতামূলক?",
        },
        a: {
          en: "Yes. Live location is required for trip monitoring, ETA, stop-level visibility, and operational control.",
          bn: "হ্যাঁ। ট্রিপ মনিটরিং, ETA, স্টপভিত্তিক দৃশ্যমানতা এবং অপারেশন কন্ট্রোলের জন্য লাইভ লোকেশন প্রয়োজন।",
        },
      },
      {
        q: {
          en: "What happens if I do not start the trip in the app?",
          bn: "আমি যদি অ্যাপে ট্রিপ শুরু না করি তাহলে কী হবে?",
        },
        a: {
          en: "The trip may remain unstarted in the system, and live monitoring or trip records may become inaccurate.",
          bn: "সেক্ষেত্রে সিস্টেমে ট্রিপটি শুরু না হওয়া অবস্থায় থেকে যেতে পারে এবং লাইভ মনিটরিং বা ট্রিপ রেকর্ড সঠিক নাও থাকতে পারে।",
        },
      },
      {
        q: {
          en: "Can I operate a different route from the one assigned in the app?",
          bn: "অ্যাপে যে রুট দেওয়া আছে তার বাইরে অন্য রুটে কি আমি গাড়ি চালাতে পারি?",
        },
        a: {
          en: "No. Drivers should only operate trips officially assigned through the system.",
          bn: "না। ড্রাইভারকে শুধুমাত্র সিস্টেমে অফিসিয়ালি নির্ধারিত ট্রিপেই চলতে হবে।",
        },
      },
      {
        q: {
          en: "What should I do if the app or internet stops working during a trip?",
          bn: "ট্রিপ চলাকালীন অ্যাপ বা ইন্টারনেট কাজ না করলে কী করতে হবে?",
        },
        a: {
          en: "Continue safely as per operational instructions, restore connectivity if possible, and report the issue to control or depot staff.",
          bn: "অপারেশনাল নির্দেশনা অনুযায়ী নিরাপদে পরিষেবা চালিয়ে যান, সম্ভব হলে সংযোগ পুনরুদ্ধার করুন এবং সমস্যা কন্ট্রোল রুম বা ডিপো কর্তৃপক্ষকে জানান।",
        },
      },
    ],
  },
  {
    key: "conductor",
    title: { en: "Conductor FAQs", bn: "কন্ডাক্টর FAQ" },
    items: [
      {
        q: {
          en: "What is the conductor app used for?",
          bn: "কন্ডাক্টর অ্যাপটি কী কাজে ব্যবহৃত হয়?",
        },
        a: {
          en: "The conductor app is used to manage live trips, issue tickets, monitor boarding activity, and update trip progress from the conductor side.",
          bn: "কন্ডাক্টর অ্যাপের মাধ্যমে লাইভ ট্রিপ পরিচালনা, টিকিট ইস্যু, যাত্রী ওঠানামা মনিটর করা এবং কন্ডাক্টর-পক্ষ থেকে ট্রিপ আপডেট করা যায়।",
        },
      },
      {
        q: {
          en: "Can the conductor issue tickets only during an active trip?",
          bn: "কন্ডাক্টর কি শুধুমাত্র অ্যাকটিভ ট্রিপের সময় টিকিট ইস্যু করতে পারবেন?",
        },
        a: {
          en: "Yes. Ticketing and trip-linked passenger actions are expected to happen against the correct active trip.",
          bn: "হ্যাঁ। টিকিটিং এবং ট্রিপ-সংযুক্ত যাত্রী-সংক্রান্ত কাজ সঠিক অ্যাকটিভ ট্রিপের সাথেই হওয়া উচিত।",
        },
      },
      {
        q: {
          en: "Why is live location important for the conductor app?",
          bn: "কন্ডাক্টর অ্যাপে লাইভ লোকেশন কেন গুরুত্বপূর্ণ?",
        },
        a: {
          en: "It supports passenger visibility, stop awareness, load estimation, and wait-notification handling for upcoming passengers.",
          bn: "এটি যাত্রীদের দৃশ্যমানতা, স্টপ সম্পর্কে সচেতনতা, বাসের লোডের আন্দাজ এবং অপেক্ষমাণ যাত্রীর নোটিফিকেশন ব্যবস্থাপনায় সাহায্য করে।",
        },
      },
      {
        q: {
          en: "What if the trip is completed in the system before all work is done?",
          bn: "সব কাজ শেষ হওয়ার আগে যদি সিস্টেমে ট্রিপ সম্পূর্ণ দেখায় তাহলে কী হবে?",
        },
        a: {
          en: "The conductor should coordinate with control or depot staff and ensure the trip is closed only through the correct operational process.",
          bn: "কন্ডাক্টরকে কন্ট্রোল রুম বা ডিপো কর্তৃপক্ষের সঙ্গে যোগাযোগ করে সঠিক অপারেশনাল প্রক্রিয়ায় ট্রিপ ক্লোজ করতে হবে।",
        },
      },
      {
        q: {
          en: "Can a conductor use multiple devices for the same trip?",
          bn: "একই ট্রিপে কি কন্ডাক্টর একাধিক ডিভাইস ব্যবহার করতে পারবেন?",
        },
        a: {
          en: "This should be avoided. A single active device is preferred for clean trip state, ticketing accuracy, and accountability.",
          bn: "এটি এড়িয়ে চলা উচিত। ট্রিপের সঠিক অবস্থা, টিকিটের নির্ভুলতা এবং জবাবদিহিতার জন্য একটি সক্রিয় ডিভাইসই উত্তম।",
        },
      },
    ],
  },
  {
    key: "owner",
    title: { en: "Owner FAQs", bn: "মালিক FAQ" },
    items: [
      {
        q: {
          en: "What is the driver app used for from an owner perspective?",
          bn: "মালিকের দৃষ্টিকোণ থেকে ড্রাইভার অ্যাপের ব্যবহার কী?",
        },
        a: {
          en: "It helps monitor assigned trips, bus movement, trip start and completion, and overall operational discipline across the fleet.",
          bn: "এটি নির্ধারিত ট্রিপ, বাসের চলাচল, ট্রিপ শুরু ও শেষ হওয়া এবং বহরের সামগ্রিক অপারেশনাল শৃঙ্খলা মনিটর করতে সাহায্য করে।",
        },
      },
      {
        q: {
          en: "Can owners know whether a driver has started a trip?",
          bn: "মালিক কি জানতে পারবেন ড্রাইভার ট্রিপ শুরু করেছেন কি না?",
        },
        a: {
          en: "Yes. Once a driver starts the trip in the app, the status can be reflected in the owner or admin dashboard.",
          bn: "হ্যাঁ। ড্রাইভার অ্যাপে ট্রিপ শুরু করলে সেই স্ট্যাটাস মালিক বা অ্যাডমিন ড্যাশবোর্ডে দেখা যায়।",
        },
      },
      {
        q: {
          en: "Can owners track live location from the system?",
          bn: "মালিক কি সিস্টেম থেকে লাইভ লোকেশন ট্র্যাক করতে পারবেন?",
        },
        a: {
          en: "Yes, provided location permission, active trip state, and data connectivity are available on the operating device.",
          bn: "হ্যাঁ, যদি ডিভাইসে লোকেশন পারমিশন, অ্যাকটিভ ট্রিপ অবস্থা এবং ডেটা সংযোগ উপলব্ধ থাকে।",
        },
      },
      {
        q: {
          en: "What if a driver is offline or not sending location updates?",
          bn: "ড্রাইভার অফলাইনে থাকলে বা লোকেশন আপডেট না পাঠালে কী হবে?",
        },
        a: {
          en: "The system may show stale or unavailable tracking, and the owner should follow up with the driver or depot control.",
          bn: "সিস্টেমে পুরনো বা অনুপস্থিত ট্র্যাকিং দেখা যেতে পারে, সেক্ষেত্রে মালিককে ড্রাইভার বা ডিপো কন্ট্রোলের সঙ্গে যোগাযোগ করতে হবে।",
        },
      },
      {
        q: {
          en: "Can the owner assign trips directly from the driver app?",
          bn: "মালিক কি ড্রাইভার অ্যাপ থেকেই ট্রিপ অ্যাসাইন করতে পারবেন?",
        },
        a: {
          en: "No. Trip assignment is expected to happen through the authorized admin, scheduler, depot, or owner control workflow.",
          bn: "না। ট্রিপ অ্যাসাইনমেন্ট অনুমোদিত অ্যাডমিন, শিডিউলার, ডিপো বা মালিকের কন্ট্রোল ওয়ার্কফ্লো থেকেই হওয়া উচিত।",
        },
      },
    ],
  },
];

const styles = {
  page: {
    minHeight: "100vh",
    background:
      "radial-gradient(circle at top left, rgba(27,154,170,0.14), transparent 30%), linear-gradient(180deg, #f6f8fb 0%, #edf3ef 100%)",
    padding: "34px 18px 56px",
  },
  shell: {
    width: "100%",
    maxWidth: "980px",
    margin: "0 auto",
  },
  hero: {
    background: "#ffffff",
    border: "1px solid rgba(19, 34, 61, 0.08)",
    borderRadius: "24px",
    padding: "26px 28px",
    boxShadow: "0 18px 44px rgba(15, 23, 42, 0.08)",
  },
  heroTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "16px",
    flexWrap: "wrap",
  },
  title: {
    margin: 0,
    color: "#13223d",
    fontSize: "2rem",
    fontWeight: 800,
  },
  subtitle: {
    margin: "12px 0 0",
    color: "#526079",
    lineHeight: 1.8,
    fontSize: "1rem",
    maxWidth: "760px",
  },
  toggle: {
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
    padding: "6px",
    borderRadius: "999px",
    border: "1px solid rgba(19, 34, 61, 0.1)",
    background: "#f8fafc",
  },
  toggleBtn: (active) => ({
    border: "none",
    cursor: "pointer",
    borderRadius: "999px",
    padding: "10px 16px",
    background: active ? "#13223d" : "transparent",
    color: active ? "#ffffff" : "#526079",
    fontWeight: 700,
    fontSize: "0.92rem",
  }),
  section: {
    marginTop: "18px",
    background: "#ffffff",
    border: "1px solid rgba(19, 34, 61, 0.08)",
    borderRadius: "22px",
    padding: "22px 24px",
    boxShadow: "0 14px 34px rgba(15, 23, 42, 0.06)",
  },
  sectionHead: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "12px",
    flexWrap: "wrap",
    marginBottom: "14px",
  },
  sectionTitle: {
    margin: 0,
    color: "#13223d",
    fontSize: "1.2rem",
    fontWeight: 800,
  },
  badge: {
    display: "inline-flex",
    alignItems: "center",
    padding: "7px 12px",
    borderRadius: "999px",
    border: "1px solid rgba(19, 34, 61, 0.08)",
    background: "#f8fafc",
    color: "#526079",
    fontSize: "0.85rem",
  },
  faqList: {
    display: "grid",
    gap: "12px",
  },
  faqItem: {
    borderRadius: "16px",
    border: "1px solid rgba(19, 34, 61, 0.08)",
    background: "#fbfcfe",
    padding: "16px 18px",
  },
  question: {
    margin: 0,
    color: "#13223d",
    fontSize: "1rem",
    fontWeight: 800,
  },
  answer: {
    margin: "10px 0 0",
    color: "#526079",
    lineHeight: 1.75,
    fontSize: "0.98rem",
  },
};

export default function FaqsPage() {
  const [language, setLanguage] = useState("en");

  const intro = useMemo(
    () =>
      language === "en"
        ? "This page contains common FAQs for driver, conductor, and owner users of the Qfare ecosystem. It is a standalone public information page and does not expose any admin controls."
        : "এই পাতায় Qfare ইকোসিস্টেমের ড্রাইভার, কন্ডাক্টর এবং মালিকদের জন্য সাধারণ FAQ দেওয়া আছে। এটি একটি স্বতন্ত্র পাবলিক তথ্যপেজ এবং এখানে কোনো অ্যাডমিন কন্ট্রোল দেখানো হয় না।",
    [language]
  );

  return (
    <div style={styles.page}>
      <div style={styles.shell}>
        <section style={styles.hero}>
          <div style={styles.heroTop}>
            <div>
              <h1 style={styles.title}>{language === "en" ? "Qfare FAQs" : "Qfare FAQ"}</h1>
              <p style={styles.subtitle}>{intro}</p>
            </div>
            <div style={styles.toggle}>
              <button
                type="button"
                style={styles.toggleBtn(language === "en")}
                onClick={() => setLanguage("en")}
              >
                English
              </button>
              <button
                type="button"
                style={styles.toggleBtn(language === "bn")}
                onClick={() => setLanguage("bn")}
              >
                বাংলা
              </button>
            </div>
          </div>
        </section>

        {faqSections.map((section) => (
          <section key={section.key} style={styles.section}>
            <div style={styles.sectionHead}>
              <h2 style={styles.sectionTitle}>{section.title[language]}</h2>
              <span style={styles.badge}>{language === "en" ? "Common questions" : "সাধারণ প্রশ্ন"}</span>
            </div>
            <div style={styles.faqList}>
              {section.items.map((item) => (
                <div key={item.q.en} style={styles.faqItem}>
                  <p style={styles.question}>{item.q[language]}</p>
                  <p style={styles.answer}>{item.a[language]}</p>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
