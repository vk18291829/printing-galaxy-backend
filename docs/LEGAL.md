The "Choose language" label, visit counting and the new footer are built. Then my answers on the legal side, which come from general knowledge and need checking by a lawyer. Everything typechecks, 107 backend tests pass (4 of them new, for visit counting), and the website passes the responsive checks at all 16 widths. I haven't seen the admin visits card in a browser, because that screen needs a staff login.

## What I built

**"Choose language"** now shows next to EN / हि in the top strip from tablet width up (Hindi: "भाषा चुनें"). On phones the strip is too tight, so it stays the globe icon, which screen readers read as "Choose language".

**Visit counting**
- **Where you see it:** Admin dashboard → **Website visits**. It shows visitors today, last 7 days and last 30 days, page views, a daily chart, where visitors came from (Google, WhatsApp/Instagram, typed link, other sites), phone/tablet/computer, and the most viewed pages.
- **No cookies, no Google Analytics.** Your own server keeps daily totals only. Visitors are told apart with a fingerprint that changes every day and can't be reversed, and IP addresses are never stored.
- **Left out of the count:** bots, and browsers set to "Do Not Track" or "Global Privacy Control".
- **No cookie banner needed:** because nothing personal is kept.
- **Who can see it:** staff with the reports permission.
- **When it starts:** counting only runs on the live (production) site, so the card stays empty during local development.

**Modern footer.** It uses logo colours only: navy, amber headings and the four-colour strip. I followed your instruction rather than the blue palette in the pasted brief. It has the brand block, Shop by range, Help, For schools, Contact, a row of three promises the code actually keeps, and policy links.
- **New Settings fields:** Admin → Settings now has **Registered business name** and **Grievance officer** (name, email, phone). These appear at the bottom of every page once filled in.
- **Your next step:** fill these in. Online shops are required to show them.

**Privacy policy:** I added "Website visits" and "Complaints" sections in English and Hindi.

## Legal and consent: what applies to your products

These are the risks I know of for your product types, highest first. Use them as a checklist for a lawyer, not as the final word.

1. **Aadhaar / PAN PVC cards (highest risk)**
   - UIDAI has publicly advised against PVC Aadhaar copies printed in the open market, and recommends people order the official PVC card from UIDAI. Check its current position.
   - Ask for an explicit tick at upload: "This is my own document, or I have the holder's permission". I can add it.
   - Call the product a "PVC copy of your document", never an official card.
   - Refuse altered documents and anyone else's ID.
   - Your app already stores these files privately and deletes them automatically. Keep it that way.
2. **School ID cards, rosters and student photos (children's data)**
   - India's data protection law (the DPDP Act) requires verifiable parental consent for children's data.
   - The school collects that consent. You only process the data on its behalf.
   - Sign a short data-processing agreement with each school: print only, keep data secure, delete on request, never use photos for marketing.
3. **Customer artwork: logos, photos, banners, wedding cards**
   - Get a "I own or have permission to use what I upload" tick at checkout.
   - Refuse obscene, defamatory or copied-brand work.
   - **Election posters and pamphlets:** the law requires the printer's and publisher's name and address on them, plus a declaration from the publisher. Check this with the lawyer before taking any.
   - Never print government emblems, police or army insignia, fake certificates or marksheets.
4. **Online-shop rules (Consumer Protection E-Commerce Rules)**
   - Show your legal name, address, customer care contact and grievance officer (now built).
   - Acknowledge complaints within 48 hours and resolve them within a month (now stated in the privacy policy).
   - No fake urgency, hidden fees or pre-ticked extras.
5. **Consent design**
   - Agreeing to terms to place an order is separate from marketing permission.
   - Marketing permission must be optional, unticked by default and easy to withdraw.
   - Your checkout already uses an explicit confirm tick, and email has an unsubscribe link.
6. **Records and incidents**
   - Keep GST invoices for the period tax law requires (roughly 6 years). Your app keeps invoices.
   - Report cyber incidents to CERT-In within 6 hours.
   - Under the DPDP Act, a data breach must be reported to the regulator and to the people affected.
7. **Timing**
   - The DPDP Rules come into force in phases. The material you pasted says the main consent provisions start 18 months after notification, and new e-commerce amendments start on 1 January 2027.
   - I can't verify these dates. Have your lawyer confirm them.

## How to protect yourself as the owner

- **Have it reviewed:** a local lawyer reviews the Terms, Privacy, Refund and Shipping pages and the school agreement once, then yearly. A CA confirms GST, and that your Shops & Establishments registration is current.
- **Train the counter:** a written list of what you refuse to print (above), with staff told to check it.
- **Keep evidence:**
  - The audit log already records who changed what.
  - Consent ticks should be stored with a date. I can add that.
- **Act on complaints quickly:** most legal trouble starts as an ignored complaint.
- **No guarantees:** nobody can certify you "fully compliant" from code. The app can make good behaviour the default, but the legal sign-off has to come from a professional.

**Next:** do you want me to build the three consent ticks? They are the ID-document declaration, the artwork-rights tick at checkout, and saving consent with a date. Nothing is committed yet.