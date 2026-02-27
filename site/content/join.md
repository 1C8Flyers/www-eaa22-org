---
title: "Join"
---

Join EAA Chapter 22 and become part of a welcoming aviation community at Cottonwood Airport.

Whether you're a pilot, student, builder, or simply aviation-curious, chapter membership connects you with:

- Monthly chapter events and hands-on activities
- Youth and education programs
- Mentorship from experienced aviators and builders
- Volunteer opportunities that strengthen local aviation

Complete the form below to get started.

<style>
.cf-signup{font-family:Arial,sans-serif;width:100%;max-width:100%;background:#fff;border-radius:14px;box-shadow:0 16px 30px rgba(15,23,42,.08);padding:22px}
.cf-grid{display:grid;gap:12px;grid-template-columns:repeat(2,minmax(0,1fr))}
.cf-field{display:flex;flex-direction:column;gap:6px}
.cf-field label{font-size:13px;color:#374151;font-weight:600}
.cf-field input,.cf-field select{padding:10px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:14px}
.cf-full{grid-column:span 2}
.cf-notice{margin-top:10px;padding:10px 12px;border-radius:10px;background:#eff6ff;color:#1e3a8a;font-size:12px}
.cf-actions{margin-top:14px;display:flex;justify-content:flex-end}
.cf-submit{background:#2563eb;color:#fff;border:0;border-radius:8px;padding:10px 18px;font-weight:600;cursor:pointer}
@media (max-width:640px){.cf-grid{grid-template-columns:1fr}.cf-full{grid-column:span 1}}
</style>
<form class="cf-signup" method="POST" action="https://chapterforge.eaa22.org/public/member-signup">
  <div class="cf-grid">
    <div class="cf-field"><label>First Name</label><input name="FirstName" required /></div>
    <div class="cf-field"><label>Last Name</label><input name="LastName" required /></div>
    <div class="cf-field"><label>Email</label><input name="Email" type="email" required /></div>
    <div class="cf-field"><label>EAA Number (optional)</label><input name="EAANumber" /></div>
    <div class="cf-field cf-full"><label>Street Address</label><input name="Street" required /></div>
    <div class="cf-field"><label>City</label><input name="City" required /></div>
    <div class="cf-field"><label>State</label><input name="State" required /></div>
    <div class="cf-field"><label>ZIP</label><input name="Zip" required /></div>
    <div class="cf-field cf-full">
      <label>How did you hear about us?</label>
      <select name="HearAbout">
        <option value="">Select...</option>
        <option>Friend or family</option>
        <option>Chapter event</option>
        <option>EAA website</option>
        <option>Social media</option>
        <option>Search engine</option>
        <option>Other</option>
      </select>
    </div>
  </div>
  <div class="cf-notice">By submitting this form, you agree to be added to our chapter events email list.</div>
  <input type="text" name="website" style="display:none" tabindex="-1" autocomplete="off" />
  <div class="cf-actions"><button class="cf-submit" type="submit">Submit</button></div>
</form>
