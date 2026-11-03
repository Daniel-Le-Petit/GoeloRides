/** Ajout manuel réservé à un administrateur identifié ; le cycliste n’a pas besoin de compte. */
(function(global){
 'use strict';
 var form,status,host,busy=false,revision=0;
 function allowed(){
  var state=global.GoeloAuthState?global.GoeloAuthState.getState():{role:global.GOELO_ROLE,user:global.GOELO_USER,pending:global.GOELO_AUTH_PENDING};
  return !state.pending&&state.role==='admin'&&!!(state.user&&state.user.id);
 }
 function update(){
  revision++;host.hidden=!allowed();
  if(host.hidden){form.reset();host.open=false;status.textContent='';}
 }
 async function submit(event){
  event.preventDefault();if(busy||!allowed()||!form.reportValidity())return;
  var id=new URL(global.location.href).searchParams.get('id'),input=form.querySelector('input');
  var pseudo=input.value.trim();if(!id||pseudo.length<2)return;
  var requestRevision=revision;busy=true;var button=form.querySelector('button');button.disabled=true;status.textContent='Ajout en cours…';
  try{
   var api=global.GoeloSignupParticipants;
   if(!api||!api.addGuestParticipant)throw Error('unavailable');
   var result=await api.addGuestParticipant(id,{first_name:pseudo});
   if(!allowed()||requestRevision!==revision)return;
   if(!result||result.ok!==true||!result.participant)throw Error(result&&result.error||'unavailable');
   input.value='';status.textContent=pseudo+' a été ajouté aux participants.';
   global.dispatchEvent(new CustomEvent('goelo:signup-changed',{detail:{route_id:id,source:'admin_manual'}}));
  }catch(error){
   if(allowed()&&requestRevision===revision){
    var messages={full:'La sortie est complète.',pseudo_taken:'Ce pseudo est déjà inscrit.',forbidden:'Accès administrateur requis.',unavailable:'Ajout impossible. Vérifie ta connexion et la liste avant de réessayer.'};
    status.textContent=messages[error.message]||messages.unavailable;
   }
  }finally{busy=false;button.disabled=false;}
 }
 function init(){
  host=document.getElementById('pd-admin-participant');if(!host)return;
  form=host.querySelector('form');status=host.querySelector('[role="status"]');
  form.addEventListener('submit',submit);
  ['goelo:auth-state','goelo:role-ready','goelo:auth-success'].forEach(function(name){global.addEventListener(name,update)});
  update();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})(window);
