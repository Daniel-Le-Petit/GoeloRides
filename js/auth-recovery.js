(function () {
  function openResetPasswordModal(session) {
    const modal = document.getElementById('modal-reset-password');

    if (!modal) {
      return;
    }

    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');

    const backdrop = modal.querySelector('.goelo-modal__backdrop');
    if (backdrop) {
      backdrop.setAttribute('data-no-close', '1');
    }

    modal.querySelector("input[name='rp-password']")?.focus();
    modal._recoverySession = session || null;
  }

  function closeResetPasswordModal() {
    const modal = document.getElementById('modal-reset-password');

    if (!modal) {
      return;
    }

    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');

    delete modal._recoverySession;

    try {
      history.replaceState(null, '', location.pathname + location.search);
    } catch (e) {}
  }

  async function submitPasswordReset() {
    const modal = document.getElementById('modal-reset-password');

    if (!modal) {
      return;
    }

    const pwEl = modal.querySelector("input[name='rp-password']");
    const confEl = modal.querySelector("input[name='rp-password-confirm']");
    const errEl = modal.querySelector('#rp-error');
    const successEl = modal.querySelector('#rp-success');

    errEl.textContent = '';
    successEl.textContent = '';

    const password = pwEl?.value?.trim() || '';
    const confirm = confEl?.value?.trim() || '';

    if (password.length < 8) {
      errEl.textContent = 'Le mot de passe doit contenir au moins 8 caractères.';
      return;
    }

    if (password !== confirm) {
      errEl.textContent = 'Les deux mots de passe doivent correspondre.';
      return;
    }

    if (!window.supabase) {
      errEl.textContent = 'Client Supabase introuvable.';
      return;
    }

    const { error } = await window.supabase.auth.updateUser({ password });

    if (error) {
      errEl.textContent = error.message || 'Erreur lors de la mise à jour du mot de passe.';
      return;
    }

    successEl.textContent = 'Mot de passe enregistré avec succès.';

    setTimeout(() => {
      closeResetPasswordModal();

      if (typeof window.resolveRole === 'function') {
        window.resolveRole();
      }
    }, 700);
  }

  function cancelPasswordRecovery() {
    closeResetPasswordModal();
  }

  window.showResetPasswordModal = openResetPasswordModal;
  window.closeResetPasswordModal = closeResetPasswordModal;
  window.submitPasswordReset = submitPasswordReset;
  window.cancelPasswordRecovery = cancelPasswordRecovery;

  document.addEventListener('click', (ev) => {
    if (ev.target.matches('#rp-save')) {
      ev.preventDefault();
      submitPasswordReset();
    }

    if (
      ev.target.matches('#rp-cancel') ||
      ev.target.closest('.modal-close')
    ) {
      ev.preventDefault();
      cancelPasswordRecovery();
    }
  });

  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') {
      const modal = document.getElementById('modal-reset-password');

      if (modal && modal.classList.contains('open')) {
        ev.preventDefault();
        cancelPasswordRecovery();
      }
    }
  });

  window.addEventListener('goelo:password-recovery', (e) => {
    openResetPasswordModal(e?.detail?.session || null);
  });

  (function clearHashIfRecovery() {
    if (location.hash && location.hash.includes('type=recovery')) {
      try {
        history.replaceState(null, '', location.pathname + location.search);
      } catch (e) {}
    }
  })();
})();
