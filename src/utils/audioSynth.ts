/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Custom Web Audio API synthesizer for retro/tech DJ sample pads.
// This is 100% computational, responsive, and requires zero network downloads!

export function playSynthesizedSample(
  ctx: AudioContext,
  destination: AudioNode,
  type: "airhorn" | "siren" | "laser" | "cymbal" | "sub" | "kick" | "snare" | "scratch"
) {
  // Guard for suspended or closed context
  if (ctx.state === "suspended") {
    ctx.resume();
  }

  const now = ctx.currentTime;
  const masterGain = ctx.createGain();
  masterGain.connect(destination);

  switch (type) {
    case "airhorn": {
      // Reggae/Dancehall Airhorn: 3-5 detuned sawtooth oscillators
      const frequencies = [320, 323, 317, 480, 640]; // Detuned fundamental and overtones
      const oscillators: OscillatorNode[] = [];
      const filter = ctx.createBiquadFilter();
      
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(1800, now);
      filter.frequency.exponentialRampToValueAtTime(1000, now + 1.2);
      filter.connect(masterGain);

      frequencies.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(freq, now);
        
        // Add a bit of natural vibrato
        const vibrato = ctx.createOscillator();
        const vibratoGain = ctx.createGain();
        vibrato.frequency.setValueAtTime(8 + idx * 2, now); // LFO around 8-12Hz
        vibratoGain.gain.setValueAtTime(3, now); // 3Hz spread
        
        vibrato.connect(vibratoGain);
        vibratoGain.connect(osc.frequency);
        
        vibrato.start(now);
        vibrato.stop(now + 1.5);
        
        osc.connect(filter);
        osc.start(now);
        osc.stop(now + 1.5);
        oscillators.push(osc);
      });

      // Volume envelope: rapid attack, slight decay to sustain, fade-out
      masterGain.gain.setValueAtTime(0, now);
      masterGain.gain.linearRampToValueAtTime(0.4, now + 0.05);
      masterGain.gain.setValueAtTime(0.4, now + 0.8);
      masterGain.gain.exponentialRampToValueAtTime(0.001, now + 1.4);
      break;
    }

    case "siren": {
      // Echo Siren: Oscillator swept by an LFO, entering a feedback delay
      const osc = ctx.createOscillator();
      const oscGain = ctx.createGain();
      const delay = ctx.createDelay(1.0);
      const delayGain = ctx.createGain();

      osc.type = "square";
      osc.frequency.setValueAtTime(440, now);

      // Create Sweep LFO
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.type = "triangle";
      lfo.frequency.setValueAtTime(3, now); // 3hz cycle
      lfoGain.gain.setValueAtTime(150, now); // sweep range

      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);

      // Set up delay loop for classic echo vibe
      delay.delayTime.setValueAtTime(0.25, now); // 1/8 note delay
      delayGain.gain.setValueAtTime(0.65, now); // feedback amount

      osc.connect(oscGain);
      oscGain.connect(masterGain);

      // Connect to delay feedback loop
      oscGain.connect(delay);
      delay.connect(delayGain);
      delayGain.connect(delay); // Loop
      delayGain.connect(masterGain); // Route feedback to output

      lfo.start(now);
      osc.start(now);

      // Siren triggers and sweeps, then cuts, leaving the delay trail
      masterGain.gain.setValueAtTime(0, now);
      masterGain.gain.linearRampToValueAtTime(0.25, now + 0.02);
      
      // Stop oscillator triggering at 0.8 seconds
      setTimeout(() => {
        try {
          lfo.stop();
          osc.stop();
        } catch (_) {}
      }, 1000);

      // Fade out master sum slowly so delay echoes persist beautifully
      masterGain.gain.setValueAtTime(0.25, now + 0.8);
      masterGain.gain.exponentialRampToValueAtTime(0.001, now + 2.5);
      break;
    }

    case "laser": {
      // Fast pitch sweep down
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(1800, now);
      osc.frequency.exponentialRampToValueAtTime(80, now + 0.35);

      osc.connect(masterGain);
      osc.start(now);
      osc.stop(now + 0.4);

      masterGain.gain.setValueAtTime(0, now);
      masterGain.gain.linearRampToValueAtTime(0.5, now + 0.01);
      masterGain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
      break;
    }

    case "cymbal": {
      // Noise buffer synthesis for hats & crash cymbals
      const bufferSize = ctx.sampleRate * 1.5;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      const noiseSource = ctx.createBufferSource();
      noiseSource.buffer = buffer;

      // Filter to make metallic
      const filter = ctx.createBiquadFilter();
      filter.type = "highpass";
      filter.frequency.setValueAtTime(8000, now);

      noiseSource.connect(filter);
      filter.connect(masterGain);

      noiseSource.start(now);
      noiseSource.stop(now + 1.5);

      masterGain.gain.setValueAtTime(0, now);
      masterGain.gain.linearRampToValueAtTime(0.3, now + 0.01);
      masterGain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
      break;
    }

    case "sub": {
      // Deep 808 sound wave
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(100, now);
      osc.frequency.exponentialRampToValueAtTime(32, now + 1.2);

      osc.connect(masterGain);
      osc.start(now);
      osc.stop(now + 1.5);

      masterGain.gain.setValueAtTime(0, now);
      masterGain.gain.linearRampToValueAtTime(0.7, now + 0.01);
      masterGain.gain.exponentialRampToValueAtTime(0.001, now + 1.4);
      break;
    }

    case "kick": {
      // Hard hitting DJ kick
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(160, now);
      osc.frequency.exponentialRampToValueAtTime(45, now + 0.12);

      osc.connect(masterGain);
      osc.start(now);
      osc.stop(now + 0.16);

      // Pitch click noise
      const clickBuffer = ctx.createBuffer(1, ctx.sampleRate * 0.01, ctx.sampleRate);
      const clickData = clickBuffer.getChannelData(0);
      for (let i = 0; i < clickData.length; i++) {
        clickData[i] = Math.random() * 2 - 1;
      }
      const clickSource = ctx.createBufferSource();
      clickSource.buffer = clickBuffer;

      const clickFilter = ctx.createBiquadFilter();
      clickFilter.type = "bandpass";
      clickFilter.frequency.setValueAtTime(2000, now);

      const clickGain = ctx.createGain();
      clickGain.gain.setValueAtTime(0.18, now);

      clickSource.connect(clickFilter);
      clickFilter.connect(clickGain);
      clickGain.connect(masterGain);
      clickSource.start(now);

      masterGain.gain.setValueAtTime(0, now);
      masterGain.gain.linearRampToValueAtTime(1.0, now + 0.005);
      masterGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      break;
    }

    case "snare": {
      // White noise snare with tonal component
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(180, now);
      osc.frequency.linearRampToValueAtTime(100, now + 0.1);
      
      const oscGain = ctx.createGain();
      oscGain.gain.setValueAtTime(0.35, now);
      oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

      osc.connect(oscGain);
      oscGain.connect(masterGain);
      osc.start(now);
      osc.stop(now + 0.15);

      // Snare rattling noise component
      const noiseBufferSize = ctx.sampleRate * 0.25;
      const noiseBuffer = ctx.createBuffer(1, noiseBufferSize, ctx.sampleRate);
      const noiseData = noiseBuffer.getChannelData(0);
      for (let i = 0; i < noiseData.length; i++) {
        noiseData[i] = Math.random() * 2 - 1;
      }
      const noiseSource = ctx.createBufferSource();
      noiseSource.buffer = noiseBuffer;

      const bandpass = ctx.createBiquadFilter();
      bandpass.type = "bandpass";
      bandpass.frequency.setValueAtTime(1500, now);

      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.28, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

      noiseSource.connect(bandpass);
      bandpass.connect(noiseGain);
      noiseGain.connect(masterGain);
      noiseSource.start(now);

      masterGain.gain.setValueAtTime(0.4, now);
      masterGain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
      break;
    }

    case "scratch": {
      // Dynamic vinyl scrub simulation: quick alternating pitch drops and rises
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      
      // Dual step scratch envelope
      osc.frequency.setValueAtTime(150, now);
      osc.frequency.linearRampToValueAtTime(450, now + 0.08);
      osc.frequency.exponentialRampToValueAtTime(90, now + 0.22);

      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.setValueAtTime(1000, now);
      filter.Q.setValueAtTime(4.0, now);

      osc.connect(filter);
      filter.connect(masterGain);
      osc.start(now);
      osc.stop(now + 0.25);

      masterGain.gain.setValueAtTime(0, now);
      masterGain.gain.linearRampToValueAtTime(0.5, now + 0.01);
      masterGain.gain.setValueAtTime(0.4, now + 0.1);
      masterGain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
      break;
    }
  }
}
