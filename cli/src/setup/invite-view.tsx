import {useRef,useState} from 'react';
import {Box,Text,useFocus,useFocusManager,useInput} from 'ink';
import TextInput from 'ink-text-input';
import {CliError} from '../oauth.ts';
import {color,SetupButton,SetupFrame} from './frame.tsx';
import type {InviteOptions} from './invites.ts';

export function InviteScreen({workspace,delivery,send,onContinue,onCancel}:InviteOptions & {onContinue:()=>void;onCancel:()=>void}) {
  const [value,setValue]=useState(''),[sent,setSent]=useState(''),[error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const pending=useRef(false);
  const {isFocused}=useFocus({id:'email',autoFocus:true});
  const {focus,activeId}=useFocusManager();
  const emailDelivery=delivery==='email';
  const submit=async()=>{
    if(pending.current)return;
    const email=value.trim().toLowerCase();
    if(!email){onContinue();return;}
    if(email.length>254 || !/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(email)){
      setError('Enter one valid email address.');focus('email');return;
    }
    pending.current=true;setBusy(true);setError('');
    try{await send(email);setSent(email);setValue('');}
    catch(cause){setError(cause instanceof CliError && cause.code==='INVITATION_REJECTED' ? cause.message : 'Couldn’t confirm the invitation. Check Team settings before trying again.');}
    finally{pending.current=false;setBusy(false);focus('email');}
  };
  const leave=()=>{if(!pending.current)onContinue();};
  useInput((input,key)=>{
    if(pending.current)return;
    if(key.ctrl&&input==='c'){onCancel();return;}
    if(key.escape){leave();return;}
    if(key.downArrow&&isFocused)focus('invite');
    if(key.upArrow&&!isFocused)focus('email');
    if(!isFocused&&(key.leftArrow||key.rightArrow))focus(activeId==='invite'?'skip':'invite');
  });
  const finish=sent?'Done':'Skip for now';
  return <SetupFrame title="Invite teammates" description={emailDelivery
    ? `Send an email invitation to join ${workspace}.`
    : `Create a private invitation link for a teammate to join ${workspace}. Share it from Team settings.`}
    footer={busy?[]:isFocused?['↓ Actions',...(value.trim()?['Enter Invite',`Esc ${finish}`]:[`Enter or Esc ${finish}`])]:['← → Move','↑ Email','Enter Select',`Esc ${finish}`]}>
    <Box flexDirection="column" marginTop={1}>
      <Text bold={isFocused}>Teammate’s email</Text>
      <Box borderStyle="round" borderColor={isFocused?color.accent:color.quiet} paddingX={1}>
        <TextInput value={value} placeholder="name@company.com" focus={isFocused&&!busy}
          onChange={next=>{setValue(next.replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g,' ').slice(0,512));setError('');}}
          onSubmit={()=>void submit()}/>
      </Box>
      {sent&&<Text color={color.accent}>{emailDelivery?`Invitation sent to ${sent}.`:`Link created for ${sent}. Find it in Team settings.`}</Text>}
      {error&&<Text color={color.error}>{error}</Text>}
    </Box>
    <Box gap={2} marginTop={1} flexWrap="wrap">
      <SetupButton id="invite" label={busy?'Inviting…':emailDelivery?'Send invitation':'Create invite link'} onPress={()=>{if(value.trim())void submit();else{setError('Enter a teammate’s email address.');focus('email');}}}/>
      <SetupButton id="skip" label={finish} onPress={leave}/>
    </Box>
  </SetupFrame>;
}
