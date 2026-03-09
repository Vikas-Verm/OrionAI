import { ref } from "vue";

export function useVoice(onTranscript) {
  const isRecording = ref(false);
  let recognition = null;

  if ("webkitSpeechRecognition" in window || "SpeechRecognition" in window) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SR();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-IN";

    recognition.onresult = (e) => {
      const transcript = Array.from(e.results)
        .map((r) => r[0].transcript)
        .join("");
      onTranscript?.(transcript);
    };
    recognition.onend = () => {
      isRecording.value = false;
    };
    recognition.onerror = () => {
      isRecording.value = false;
    };
  }

  function toggleVoice() {
    if (!recognition) {
      alert("Voice input not supported in this browser");
      return;
    }
    if (isRecording.value) {
      recognition.stop();
      isRecording.value = false;
    } else {
      recognition.start();
      isRecording.value = true;
    }
  }

  return { isRecording, toggleVoice };
}
