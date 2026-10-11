const cardedexAccount = {
  client: null,
  session: null,
  user: null,
  initialized: false,
};

function accountText(key) {
  const da = state.settings.language === "da";
  const copy = {
    title: da ? "Cardedex-konto" : "Cardedex account",
    description: da
      ? "Log ind for at synkronisere din samling på tværs af enheder."
      : "Sign in to keep your collection synchronized across devices.",
    signedOut: da ? "Logget ud" : "Signed out",
    signedIn: da ? "Logget ind" : "Signed in",
    email: da ? "E-mailadresse" : "Email address",
    signIn: da ? "Send mig et loginlink" : "Email me a sign-in link",
    signOut: da ? "Log ud" : "Sign out",
    sending: da ? "Sender…" : "Sending…",
    sent: da
      ? "Tjek din e-mail, og åbn loginlinket på denne enhed."
      : "Check your email and open the sign-in link on this device.",
    invalidEmail: da
      ? "Indtast en gyldig e-mailadresse."
      : "Enter a valid email address.",
    unavailable: da
      ? "Kontologin kunne ikke indlæses. Prøv igen online."
      : "Account sign-in could not load. Try again while online.",
    error: da ? "Login mislykkedes. Prøv igen." : "Sign-in failed. Try again.",
  };
  return copy[key] || key;
}

function accountMessage(message = "", isError = false) {
  const node = document.querySelector("#accountMessage");
  if (!node) return;
  node.textContent = message;
  node.classList.toggle("error", isError);
}

function renderAccount() {
  const signedIn = Boolean(cardedexAccount.user);
  const form = document.querySelector("#accountSignInForm");
  const details = document.querySelector("#accountSignedIn");
  const badge = document.querySelector("#accountBadge");
  const identity = document.querySelector("#accountIdentity");
  const signInButton = document.querySelector("#accountSignIn");
  const signOutButton = document.querySelector("#accountSignOut");
  const title = document.querySelector("#accountTitle");
  const description = document.querySelector("#accountDescription");
  const emailLabel = document.querySelector("#accountEmailLabel");
  if (title) title.textContent = accountText("title");
  if (description) description.textContent = accountText("description");
  if (emailLabel) emailLabel.textContent = accountText("email");
  if (badge) {
    badge.textContent = accountText(signedIn ? "signedIn" : "signedOut");
    badge.classList.toggle("active", signedIn);
  }
  if (form) form.hidden = signedIn;
  if (details) details.hidden = !signedIn;
  if (identity) identity.textContent = cardedexAccount.user?.email || "";
  if (signInButton) signInButton.textContent = accountText("signIn");
  if (signOutButton) signOutButton.textContent = accountText("signOut");
}

function applyAccountLanguage() {
  renderAccount();
}

async function updateAccountSession(session) {
  const previousId = cardedexAccount.user?.id || null;
  cardedexAccount.session = session || null;
  cardedexAccount.user = session?.user || null;
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
      flowType: "pkce",
    },
  });
  const { data, error } = await cardedexAccount.client.auth.getSession();
  if (error) accountMessage(accountText("error"), true);
  await updateAccountSession(data?.session || null);
  cardedexAccount.client.auth.onAuthStateChange((_event, session) => {
    setTimeout(() => updateAccountSession(session), 0);
  });
}

document.querySelector("#accountSignInForm")?.addEventListener(
  "submit",
  async (event) => {
    event.preventDefault();
    const input = document.querySelector("#accountEmail");
    const button = document.querySelector("#accountSignIn");
    const email = input?.value.trim() || "";
    if (!input?.checkValidity() || !email) {
      accountMessage(accountText("invalidEmail"), true);
      input?.reportValidity();
      return;
    }
    if (!cardedexAccount.client) {
      accountMessage(accountText("unavailable"), true);
      return;
    }
    button.disabled = true;
    button.textContent = accountText("sending");
    accountMessage();
    const redirectTo = `${location.origin}${location.pathname}`;
    const { error } = await cardedexAccount.client.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo, shouldCreateUser: true },
    });
    button.disabled = false;
    button.textContent = accountText("signIn");
    accountMessage(
      error ? (error.message || accountText("error")) : accountText("sent"),
      Boolean(error),
    );
  },
);

document.querySelector("#accountSignOut")?.addEventListener("click", async () => {
  if (!cardedexAccount.client) return;
  const button = document.querySelector("#accountSignOut");
  button.disabled = true;
  const { error } = await cardedexAccount.client.auth.signOut();
  button.disabled = false;
  if (error) accountMessage(error.message || accountText("error"), true);
});

initializeAccount();
