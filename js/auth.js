const cardedexAccount = {
  client: null,
  session: null,
  user: null,
  initialized: false,
  pendingEmail: "",
};

function accountText(key) {
  const da = state.settings.language === "da";
  const copy = {
    title: da ? "Cardedex-konto" : "Cardedex account",
    description: da
      ? "Indtast din e-mail for at oprette en konto eller logge ind på denne enhed."
      : "Enter your email to create an account or sign in on this device.",
    signedOut: da ? "Logget ud" : "Signed out",
    signedIn: da ? "Logget ind" : "Signed in",
    email: da ? "E-mailadresse" : "Email address",
    sendCode: da ? "Fortsæt med e-mail" : "Continue with email",
    code: da ? "Sekscifret login-kode" : "Six-digit sign-in code",
    verifyCode: da ? "Log ind på denne enhed" : "Sign in on this device",
    anotherEmail: da ? "Brug en anden e-mail" : "Use another email",
    signOut: da ? "Log ud" : "Sign out",
    sending: da ? "Sender…" : "Sending…",
    verifying: da ? "Kontrollerer…" : "Checking…",
    codeSent: da
      ? "Indtast den sekscifrede kode fra e-mailen. Er du ny, oprettes din konto. Ellers logger du ind på din eksisterende konto."
      : "Enter the six-digit code from the email. If you are new, this creates your account. Otherwise it signs in to your existing account.",
    invalidEmail: da ? "Indtast en gyldig e-mailadresse." : "Enter a valid email address.",
    invalidCode: da
      ? "Indtast den sekscifrede kode fra e-mailen."
      : "Enter the six-digit code from the email.",
    unavailable: da
      ? "Kontologin kunne ikke indlæses. Prøv igen online."
      : "Account sign-in could not load. Try again while online.",
    signInFailed: da
      ? "Koden kunne ikke bruges. Bed om en ny kode, og prøv igen."
      : "That code could not be used. Request a new code and try again.",
    sendFailed: da
      ? "Koden kunne ikke sendes. Kontrollér din e-mailadresse og internetforbindelse, og prøv igen."
      : "The code could not be sent. Check your email address and connection, then try again.",
  };
  return copy[key] || key;
}

function accountMessage(message = "", isError = false) {
  const node = document.querySelector("#accountMessage");
  if (!node) return;
  node.textContent = message;
  node.classList.toggle("error", isError);
}

function setCodeStep(show) {
  const signIn = document.querySelector("#accountSignInForm");
  const code = document.querySelector("#accountCodeForm");
  if (signIn) signIn.hidden = show || Boolean(cardedexAccount.user);
  if (code) code.hidden = !show || Boolean(cardedexAccount.user);
  if (show) document.querySelector("#accountCode")?.focus();
}

function renderAccount() {
  const signedIn = Boolean(cardedexAccount.user);
  const form = document.querySelector("#accountSignInForm");
  const codeForm = document.querySelector("#accountCodeForm");
  const details = document.querySelector("#accountSignedIn");
  const badge = document.querySelector("#accountBadge");
  const identity = document.querySelector("#accountIdentity");
  const title = document.querySelector("#accountTitle");
  const description = document.querySelector("#accountDescription");
  const emailLabel = document.querySelector("#accountEmailLabel");
  const codeLabel = document.querySelector("#accountCodeLabel");
  if (title) title.textContent = accountText("title");
  if (description) description.textContent = accountText("description");
  if (emailLabel) emailLabel.textContent = accountText("email");
  if (codeLabel) codeLabel.textContent = accountText("code");
  if (badge) {
    badge.textContent = accountText(signedIn ? "signedIn" : "signedOut");
    badge.classList.toggle("active", signedIn);
  }
  if (form) form.hidden = signedIn || Boolean(cardedexAccount.pendingEmail);
  if (codeForm) codeForm.hidden = signedIn || !cardedexAccount.pendingEmail;
  if (details) details.hidden = !signedIn;
  if (identity) identity.textContent = cardedexAccount.user?.email || "";
  const labels = {
    accountSignIn: "sendCode",
    accountVerifyCode: "verifyCode",
    accountCancelCode: "anotherEmail",
    accountSignOut: "signOut",
  };
  Object.entries(labels).forEach(([id, key]) => {
    const node = document.querySelector(`#${id}`);
    if (node) node.textContent = accountText(key);
  });
}

function applyAccountLanguage() {
  renderAccount();
}

async function updateAccountSession(session) {
  const previousId = cardedexAccount.user?.id || null;
  cardedexAccount.session = session || null;
  cardedexAccount.user = session?.user || null;
  if (cardedexAccount.user) cardedexAccount.pendingEmail = "";
  renderAccount();
  if (previousId !== (cardedexAccount.user?.id || null)) accountMessage();
  if (typeof handleSyncAccountChange === "function") {
    await handleSyncAccountChange(cardedexAccount.user);
  }
}

async function initializeAccount() {
  if (cardedexAccount.initialized) return;
  cardedexAccount.initialized = true;
  renderAccount();
  const config = globalThis.CARDEDEX_BACKEND;
  const factory = globalThis.supabase?.createClient;
  if (!config?.url || !config?.publishableKey || typeof factory !== "function") {
    accountMessage(accountText("unavailable"), true);
    return;
  }
  cardedexAccount.client = factory(config.url, config.publishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: "implicit",
    },
  });
  const { data, error } = await cardedexAccount.client.auth.getSession();
  if (error) accountMessage(accountText("signInFailed"), true);
  await updateAccountSession(data?.session || null);
  cardedexAccount.client.auth.onAuthStateChange((_event, nextSession) => {
    setTimeout(() => updateAccountSession(nextSession), 0);
  });
}

document.querySelector("#accountSignInForm")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const input = document.querySelector("#accountEmail");
  const button = document.querySelector("#accountSignIn");
  const email = input?.value.trim().toLowerCase() || "";
  if (!input?.checkValidity() || !email) {
    accountMessage(accountText("invalidEmail"), true);
    input?.reportValidity();
    return;
  }
  if (!cardedexAccount.client) return accountMessage(accountText("unavailable"), true);
  button.disabled = true;
  button.textContent = accountText("sending");
  accountMessage();
  const { error } = await cardedexAccount.client.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true },
  });
  button.disabled = false;
  button.textContent = accountText("sendCode");
  if (error) return accountMessage(accountText("sendFailed"), true);
  cardedexAccount.pendingEmail = email;
  accountMessage(accountText("codeSent"));
  setCodeStep(true);
});

document.querySelector("#accountCodeForm")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const input = document.querySelector("#accountCode");
  const button = document.querySelector("#accountVerifyCode");
  const token = input?.value.trim() || "";
  if (!/^\d{6}$/.test(token)) {
    accountMessage(accountText("invalidCode"), true);
    input?.reportValidity();
    return;
  }
  button.disabled = true;
  button.textContent = accountText("verifying");
  const { error } = await cardedexAccount.client.auth.verifyOtp({
    email: cardedexAccount.pendingEmail,
    token,
    type: "email",
  });
  button.disabled = false;
  button.textContent = accountText("verifyCode");
  if (error) accountMessage(accountText("signInFailed"), true);
});

document.querySelector("#accountCancelCode")?.addEventListener("click", () => {
  cardedexAccount.pendingEmail = "";
  const input = document.querySelector("#accountCode");
  if (input) input.value = "";
  accountMessage();
  setCodeStep(false);
});

document.querySelector("#accountSignOut")?.addEventListener("click", async () => {
  if (!cardedexAccount.client) return;
  const button = document.querySelector("#accountSignOut");
  button.disabled = true;
  const { error } = await cardedexAccount.client.auth.signOut();
  button.disabled = false;
  if (error) accountMessage(accountText("signInFailed"), true);
});

initializeAccount();
