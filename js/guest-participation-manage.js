(function () {
  'use strict';
  var privateToken = new URLSearchParams(location.hash.slice(1)).get('token');
  var busy = false;
  var status = document.getElementById('guest-manage-status');
  var confirmButton = document.getElementById('guest-confirm');
  var cancelButton = document.getElementById('guest-cancel');
  var routeLink = document.getElementById('guest-route');
  async function update(action) {
    if (busy) return;
    if (!/^[a-f0-9]{64}$/.test(privateToken || '')) { status.textContent = 'Lien absent ou invalide. Ouvre le lien de ton e-mail.'; return; }
    busy = true;
    confirmButton.disabled = cancelButton.disabled = true;
    try {
      var data = await window.GoeloGuestParticipation.invoke({ action: action, token: privateToken });
      document.getElementById('guest-manage-title').textContent = data.title || 'Sortie GoëloRides';
      routeLink.href = 'parcours.html?id=' + encodeURIComponent(data.route_id);
      routeLink.hidden = false;
      confirmButton.hidden = data.status !== 'pending';
      cancelButton.hidden = data.status !== 'joined';
      status.textContent = data.status === 'joined' ? 'Ta participation est confirmée, ' + data.pseudo + ' ! Ton pseudo apparaît dans les participants.' : data.status === 'cancelled' ? 'Ta participation est annulée.' : 'Il reste une étape : confirme ta participation ci-dessous. La place sera attribuée à la confirmation, selon les disponibilités.';
    } catch (error) { status.textContent = window.GoeloGuestParticipation.message(error.message); }
    finally { busy = false; confirmButton.disabled = cancelButton.disabled = false; }
  }
  confirmButton.addEventListener('click', function () { update('confirm'); });
  cancelButton.addEventListener('click', function () { if (window.confirm('Annuler ta participation à cette sortie ?')) update('cancel'); });
  // La lecture du lien ne modifie pas l’inscription, y compris pour les scanners d’e-mails.
  update('status');
})();
