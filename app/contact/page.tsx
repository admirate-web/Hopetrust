'use client';

import React from 'react';
import Header from '@/components/Header';
import { motion } from 'motion/react';
import { bricolage } from '@/lib/fonts';
import { MapPin, MessageSquare } from 'lucide-react';
import dynamic from 'next/dynamic';
import { siteConfig } from '@/lib/config';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { z } from 'zod';

const Footer = dynamic(() => import('@/components/Footer'));
const ScrollingTextBanner = dynamic(() => import('@/components/ScrollingTextBanner'));

const CustomSubmitButton = ({ status, text }: { status: 'idle' | 'sending' | 'sent', text: string }) => {
  return (
    <div className="custom-button-wrapper">
      <style dangerouslySetInnerHTML={{ __html: `
        .custom-button-wrapper .button {
          --primary: #00373E;
          --bg-solid: #00373E;
          --neutral-1: #004d57;
          --neutral-2: #00373E;
          --radius: 14px;
          cursor: pointer;
          border-radius: var(--radius);
          text-shadow: 0 1px 1px rgba(0, 0, 0, 0.3);
          border: none;
          box-shadow: 0 0.5px 0.5px 1px rgba(255, 255, 255, 0.1),
            0 10px 20px rgba(0, 0, 0, 0.2), 0 4px 5px 0px rgba(0, 0, 0, 0.05);
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          transition: all 0.3s ease;
          min-width: 160px;
          padding: 16px;
          height: 56px;
          font-family: inherit;
          font-style: normal;
          font-size: 15px;
          font-weight: 600;
          background: var(--bg-solid);
          width: 100%;
        }
        @media (min-width: 640px) {
          .custom-button-wrapper .button {
            min-width: 200px;
            padding: 20px;
            height: 64px;
            font-size: 17px;
            width: auto;
          }
        }
        .custom-button-wrapper .button:hover {
          transform: scale(1.02);
          box-shadow: 0 0 1px 2px rgba(255, 255, 255, 0.3),
            0 15px 30px rgba(0, 0, 0, 0.3), 0 10px 3px -3px rgba(0, 0, 0, 0.04);
        }
        .custom-button-wrapper .button:active {
          transform: scale(1);
          box-shadow: 0 0 1px 2px rgba(255, 255, 255, 0.3),
            0 10px 3px -3px rgba(0, 0, 0, 0.2);
        }
        .custom-button-wrapper .button:after {
          content: "";
          position: absolute;
          inset: 0;
          border-radius: var(--radius);
          border: 2.5px solid transparent;
          background: linear-gradient(var(--neutral-1), var(--neutral-2)) padding-box,
            linear-gradient(to bottom, rgba(255, 255, 255, 0.2), rgba(0, 0, 0, 0.45)) border-box;
          z-index: 0;
          transition: all 0.4s ease;
        }
        .custom-button-wrapper .button:hover::after {
          transform: scale(1.05, 1.1);
          box-shadow: inset 0 -1px 3px 0 rgba(255, 255, 255, 1);
        }
        .custom-button-wrapper .button::before {
          content: "";
          inset: 7px 6px 6px 6px;
          position: absolute;
          background: linear-gradient(to top, var(--neutral-1), var(--neutral-2));
          border-radius: 30px;
          filter: blur(0.5px);
          z-index: 2;
        }
        .custom-button-wrapper .state p {
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0;
          color: white;
        }
        .custom-button-wrapper .state .icon {
          position: absolute;
          left: 0;
          top: 0;
          bottom: 0;
          margin: auto;
          transform: scale(1.25);
          transition: all 0.3s ease;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
        }
        .custom-button-wrapper .state .icon svg { overflow: visible; }
        .custom-button-wrapper .outline {
          position: absolute;
          border-radius: inherit;
          overflow: hidden;
          z-index: 1;
          opacity: 0;
          transition: opacity 0.4s ease;
          inset: -2px -3.5px;
        }
        .custom-button-wrapper .outline::before {
          content: "";
          position: absolute;
          inset: -100%;
          background: conic-gradient(from 180deg, transparent 60%, white 80%, transparent 100%);
          animation: spin 2s linear infinite;
          animation-play-state: paused;
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        .custom-button-wrapper .button:hover .outline { opacity: 1; }
        .custom-button-wrapper .button:hover .outline::before { animation-play-state: running; }
        .custom-button-wrapper .state p span {
          display: block;
          opacity: 0;
          animation: slideDown 0.8s ease forwards calc(var(--i) * 0.03s);
        }
        .custom-button-wrapper .button:hover p span {
          opacity: 1;
          animation: wave 0.5s ease forwards calc(var(--i) * 0.02s);
        }
        .custom-button-wrapper .button--sent p span,
        .custom-button-wrapper .button--sending p span {
          opacity: 1;
          animation: disapear 0.6s ease forwards calc(var(--i) * 0.03s);
        }
        @keyframes wave {
          30% { opacity: 1; transform: translateY(4px) translateX(0) rotate(0); }
          50% { opacity: 1; transform: translateY(-3px) translateX(0) rotate(0); color: #F97316; }
          100% { opacity: 1; transform: translateY(0) translateX(0) rotate(0); }
        }
        @keyframes slideDown {
          0% { opacity: 0; transform: translateY(-20px) translateX(5px) rotate(-90deg); color: #F97316; filter: blur(5px); }
          30% { opacity: 1; transform: translateY(4px) translateX(0) rotate(0); filter: blur(0); }
          50% { opacity: 1; transform: translateY(-3px) translateX(0) rotate(0); }
          100% { opacity: 1; transform: translateY(0) translateX(0) rotate(0); }
        }
        @keyframes disapear {
          from { opacity: 1; }
          to { opacity: 0; transform: translateX(5px) translateY(20px); color: #F97316; filter: blur(5px); }
        }
        .custom-button-wrapper .state--default .icon svg { animation: land 0.6s ease forwards; }
        .custom-button-wrapper .button:hover .state--default .icon { transform: rotate(45deg) scale(1.25); }
        .custom-button-wrapper .button--sent .state--default svg,
        .custom-button-wrapper .button--sending .state--default svg { animation: takeOff 0.8s linear forwards; }
        .custom-button-wrapper .button--sent .state--default .icon,
        .custom-button-wrapper .button--sending .state--default .icon { transform: rotate(0) scale(1.25); }
        @keyframes takeOff {
          0% { opacity: 1; }
          60% { opacity: 1; transform: translateX(70px) rotate(45deg) scale(2); }
          100% { opacity: 0; transform: translateX(160px) rotate(45deg) scale(0); }
        }
        @keyframes land {
          0% { transform: translateX(-60px) translateY(30px) rotate(-50deg) scale(2); opacity: 0; filter: blur(3px); }
          100% { transform: translateX(0) translateY(0) rotate(0); opacity: 1; filter: blur(0); }
        }
        .custom-button-wrapper .state--default .icon:before {
          content: "";
          position: absolute;
          top: 50%;
          height: 2px;
          width: 0;
          left: -5px;
          background: linear-gradient(to right, transparent, rgba(255, 255, 255, 0.5));
        }
        .custom-button-wrapper .button--sent .state--default .icon:before,
        .custom-button-wrapper .button--sending .state--default .icon:before { animation: contrail 0.8s linear forwards; }
        @keyframes contrail {
          0% { width: 0; opacity: 1; }
          8% { width: 15px; }
          60% { opacity: 0.7; width: 80px; }
          100% { opacity: 0; width: 160px; }
        }
        .custom-button-wrapper .state {
          padding-left: 29px;
          z-index: 2;
          display: flex;
          position: relative;
        }
        .custom-button-wrapper .state--default span:nth-child(4) { margin-right: 5px; }
        .custom-button-wrapper .state--sent { display: none; }
        .custom-button-wrapper .state--sent svg { transform: scale(1.25); margin-right: 8px; }
        .custom-button-wrapper .button--sent .state--default,
        .custom-button-wrapper .button--sending .state--default { position: absolute; }
        .custom-button-wrapper .button--sent .state--sent { display: flex; }
        .custom-button-wrapper .button--sending .state--sent { display: none; }
        .custom-button-wrapper .button--sent .state--sent span {
          opacity: 0;
          animation: slideDown 0.8s ease forwards calc(var(--i) * 0.2s);
        }
        .custom-button-wrapper .button--sent .state--sent .icon svg {
          opacity: 0;
          animation: appear 1.2s ease forwards 0.8s;
        }
        @keyframes appear {
          0% { opacity: 0; transform: scale(4) rotate(-40deg); color: #F97316; filter: blur(4px); }
          30% { opacity: 1; transform: scale(0.6); filter: blur(1px); }
          50% { opacity: 1; transform: scale(1.2); filter: blur(0); }
          100% { opacity: 1; }
        }
      `}} />
      <button
        type="submit"
        disabled={status !== 'idle'}
        className={`button ${status === 'sent' ? 'button--sent' : status === 'sending' ? 'button--sending' : ''}`}
      >
        <div className="outline" />
        <div className="state state--default">
          <div className="icon">
            <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <g style={{filter: 'url(#shadow)'}}>
                <path d="M14.2199 21.63C13.0399 21.63 11.3699 20.8 10.0499 16.83L9.32988 14.67L7.16988 13.95C3.20988 12.63 2.37988 10.96 2.37988 9.78001C2.37988 8.61001 3.20988 6.93001 7.16988 5.60001L15.6599 2.77001C17.7799 2.06001 19.5499 2.27001 20.6399 3.35001C21.7299 4.43001 21.9399 6.21001 21.2299 8.33001L18.3999 16.82C17.0699 20.8 15.3999 21.63 14.2199 21.63ZM7.63988 7.03001C4.85988 7.96001 3.86988 9.06001 3.86988 9.78001C3.86988 10.5 4.85988 11.6 7.63988 12.52L10.1599 13.36C10.3799 13.43 10.5599 13.61 10.6299 13.83L11.4699 16.35C12.3899 19.13 13.4999 20.12 14.2199 20.12C14.9399 20.12 16.0399 19.13 16.9699 16.35L19.7999 7.86001C20.3099 6.32001 20.2199 5.06001 19.5699 4.41001C18.9199 3.76001 17.6599 3.68001 16.1299 4.19001L7.63988 7.03001Z" fill="currentColor" />
                <path d="M10.11 14.4C9.92005 14.4 9.73005 14.33 9.58005 14.18C9.29005 13.89 9.29005 13.41 9.58005 13.12L13.16 9.53C13.45 9.24 13.93 9.24 14.22 9.53C14.51 9.82 14.51 10.3 14.22 10.59L10.64 14.18C10.5 14.33 10.3 14.4 10.11 14.4Z" fill="currentColor" />
              </g>
              <defs>
                <filter id="shadow">
                  <feDropShadow dx={0} dy={1} stdDeviation="0.6" floodOpacity="0.5" />
                </filter>
              </defs>
            </svg>
          </div>
          <p>
            {text.replace(/\s+/g, "").split("").map((char, i) => (
              <span key={i} style={{ '--i': i } as React.CSSProperties}>{char}</span>
            ))}
          </p>
        </div>
        <div className="state state--sent">
          <div className="icon">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" height="1em" width="1em" strokeWidth="0.5px" stroke="black">
              <g style={{filter: 'url(#shadow)'}}>
                <path fill="currentColor" d="M12 22.75C6.07 22.75 1.25 17.93 1.25 12C1.25 6.07 6.07 1.25 12 1.25C17.93 1.25 22.75 6.07 22.75 12C22.75 17.93 17.93 22.75 12 22.75ZM12 2.75C6.9 2.75 2.75 6.9 2.75 12C2.75 17.1 6.9 21.25 12 21.25C17.1 21.25 21.25 17.1 21.25 12C21.25 6.9 17.1 2.75 12 2.75Z" />
                <path fill="currentColor" d="M10.5795 15.5801C10.3795 15.5801 10.1895 15.5001 10.0495 15.3601L7.21945 12.5301C6.92945 12.2401 6.92945 11.7601 7.21945 11.4701C7.50945 11.1801 7.98945 11.1801 8.27945 11.4701L10.5795 13.7701L15.7195 8.6301C16.0095 8.3401 16.4895 8.3401 16.7795 8.6301C17.0695 8.9201 17.0695 9.4001 16.7795 9.6901L11.1095 15.3601C10.9695 15.5001 10.7795 15.5801 10.5795 15.5801Z" />
              </g>
            </svg>
          </div>
          <p>
            {"Sent".split("").map((char, i) => (
              <span key={i} style={{ '--i': i + 5 } as React.CSSProperties}>{char}</span>
            ))}
          </p>
        </div>
      </button>
    </div>
  );
};

const contactSchema = z.object({
  full_name: z.string().min(2, 'Name must be at least 2 characters'),
  phone: z.string().min(10, 'Please enter a valid phone number'),
  email: z.string().email('Please enter a valid email address'),
  message: z.string().min(10, 'Message must be at least 10 characters'),
});

export default function ContactPage() {
  const [formStatus, setFormStatus] = React.useState<'idle' | 'sending' | 'sent'>('idle');
  const [formData, setFormData] = React.useState({
    full_name: '',
    phone: '',
    email: '',
    message: '',
  });
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (fieldErrors[name]) {
      setFieldErrors(prev => { const n = { ...prev }; delete n[name]; return n; });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = contactSchema.safeParse(formData);
    if (!result.success) {
      const errors: Record<string, string> = {};
      result.error.errors.forEach(err => {
        if (err.path[0]) errors[err.path[0] as string] = err.message;
      });
      setFieldErrors(errors);
      toast.error(result.error.errors[0].message);
      return;
    }
    setFieldErrors({});
    setFormStatus('sending');
    try {
      const [supabaseResult] = await Promise.allSettled([
        supabase.from('contact_submissions').insert(result.data),
        fetch('/__forms.html', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ 'form-name': 'contact', ...result.data }).toString(),
        }),
      ]);
      if (supabaseResult.status === 'fulfilled' && supabaseResult.value.error) {
        throw supabaseResult.value.error;
      }
      setFormStatus('sent');
      toast.success('Message sent successfully! We\'ll get back to you soon.');
      setFormData({ full_name: '', phone: '', email: '', message: '' });
    } catch {
      setFormStatus('idle');
      toast.error('Failed to send message. Please try again.');
    }
  };

  return (
    <>
      <Header />
      {/* Hidden form for Netlify build-time detection */}
      <form name="contact" data-netlify="true" netlify-honeypot="bot-field" hidden>
        <input name="bot-field" />
        <input name="full_name" />
        <input name="phone" />
        <input name="email" />
        <textarea name="message" />
      </form>

      <main className={`${bricolage.className} min-h-screen pt-20`}>

        {/* ── Hero: orange banner ── */}
        <section className="bg-[#ED7428] py-8 sm:py-10">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
            <motion.h1
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="text-3xl sm:text-4xl lg:text-[48px] font-bold text-[#00373E]"
            >
              Get in Touch
            </motion.h1>
          </div>
        </section>

        {/* ── Appointment info + Contact cards ── */}
        <section className="bg-[#F7F5EF] py-10 sm:py-14">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="text-center mb-10 sm:mb-14"
            >
              <p className="text-base sm:text-lg lg:text-[24px] font-semibold text-[#00373E]">
                In-Clinic / Online Appointments
              </p>
              <p className="text-sm sm:text-base lg:text-[20px] text-[#486364] mt-1">
                Office Hours {siteConfig.hours.display} ({siteConfig.hours.displayDays})
                <br />
                Except Holidays
              </p>
            </motion.div>

            {/* Contact cards row */}
            <div className="grid grid-cols-1 min-[480px]:grid-cols-3 gap-4 sm:gap-6 max-w-4xl mx-auto">
              <motion.a
                href={`mailto:${siteConfig.contact.email}`}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                whileHover={{ y: -6, scale: 1.03 }}
                transition={{ duration: 0.5, delay: 0.15 }}
                className="group flex flex-col items-center justify-center bg-white border border-gray-300 rounded-2xl py-6 sm:py-8 px-4 text-center hover:bg-[#00373E] hover:border-[#00373E] hover:shadow-xl transition-all duration-300 cursor-pointer"
              >
                <span className="text-lg sm:text-xl lg:text-[24px] font-bold text-[#00373E] group-hover:text-white transition-colors duration-300">Email</span>
                <span className="text-sm sm:text-base text-[#486364] mt-1 group-hover:text-white/80 transition-colors duration-300">Frontoffice</span>
              </motion.a>

              <motion.a
                href={`tel:${siteConfig.contact.phone.replace(/\s/g, '')}`}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                whileHover={{ y: -6, scale: 1.03 }}
                transition={{ duration: 0.5, delay: 0.25 }}
                className="group flex flex-col items-center justify-center bg-white border border-gray-300 rounded-2xl py-6 sm:py-8 px-4 text-center hover:bg-[#00373E] hover:border-[#00373E] hover:shadow-xl transition-all duration-300 cursor-pointer"
              >
                <span className="text-lg sm:text-xl lg:text-[24px] font-bold text-[#00373E] group-hover:text-white transition-colors duration-300">Call us</span>
                <span className="text-sm sm:text-base text-[#486364] mt-1 group-hover:text-white/80 transition-colors duration-300">{siteConfig.contact.phone}</span>
              </motion.a>

              <motion.a
                href={siteConfig.contact.address.mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                whileHover={{ y: -6, scale: 1.03 }}
                transition={{ duration: 0.5, delay: 0.35 }}
                className="group flex flex-col items-center justify-center bg-white border border-gray-300 rounded-2xl py-6 sm:py-8 px-4 text-center hover:bg-[#00373E] hover:border-[#00373E] hover:shadow-xl transition-all duration-300 cursor-pointer"
              >
                <span className="text-lg sm:text-xl lg:text-[24px] font-bold text-[#00373E] group-hover:text-white transition-colors duration-300">Visit Us</span>
                <span className="text-sm sm:text-base text-[#486364] mt-1 group-hover:text-white/80 transition-colors duration-300">Frontoffice</span>
              </motion.a>
            </div>
          </div>
        </section>

        {/* ── Training Enquiries ── */}
        <section className="bg-[#00373E] py-10 sm:py-14">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="mx-auto max-w-4xl px-6 sm:px-12 text-center"
          >
            <h2 className="text-2xl sm:text-3xl lg:text-[40px] font-bold text-[#ED7428] mb-2">
              Training enquiries
            </h2>
            <p className="text-white/80 text-sm sm:text-base lg:text-[20px] mb-8">
              Professional courses and workshops
            </p>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-4 sm:gap-6">
              <motion.a
                href={`mailto:${siteConfig.contact.trainingEmail}`}
                whileHover={{ y: -4, scale: 1.05 }}
                transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                className="flex items-center justify-center bg-white rounded-2xl py-4 sm:py-5 px-8 sm:px-14 text-center hover:bg-[#ED7428] hover:shadow-xl transition-all duration-300 w-full sm:w-auto sm:min-w-[180px] cursor-pointer group"
              >
                <span className="text-base sm:text-lg lg:text-[24px] font-bold text-[#00373E] group-hover:text-white transition-colors duration-300">Email</span>
              </motion.a>
              <motion.a
                href={`tel:${siteConfig.contact.trainingPhone.replace(/\s/g, '')}`}
                whileHover={{ y: -4, scale: 1.05 }}
                transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                className="flex flex-col items-center justify-center bg-white rounded-2xl py-4 sm:py-5 px-8 sm:px-14 text-center hover:bg-[#ED7428] hover:shadow-xl transition-all duration-300 w-full sm:w-auto sm:min-w-[180px] cursor-pointer group"
              >
                <span className="text-base sm:text-lg lg:text-[24px] font-bold text-[#00373E] group-hover:text-white transition-colors duration-300">Call us</span>
                <span className="text-sm sm:text-base text-[#486364] mt-1 group-hover:text-white/80 transition-colors duration-300">{siteConfig.contact.trainingPhone}</span>
              </motion.a>
            </div>
          </motion.div>
        </section>

        {/* ── Scrolling Text Banner ── */}
        <ScrollingTextBanner />

        {/* ── Form + Map Section ── */}
        <section className="py-10 sm:py-14 lg:py-16 bg-white">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-10 lg:gap-16 items-start">

              {/* Form */}
              <motion.div
                initial={{ opacity: 0, x: -30 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6 }}
                className="bg-[#FFF5ED] p-5 sm:p-8 md:p-10 rounded-2xl sm:rounded-3xl shadow-sm"
              >
                <div className="mb-6">
                  <h2 className="text-2xl sm:text-3xl lg:text-[40px] font-bold text-[#00373E] mb-2">Send us a Message</h2>
                  <p className="text-sm sm:text-base lg:text-[20px] text-[#486364]">Fill out the form below and our team will get back to you shortly.</p>
                </div>

                <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
                  <div className="space-y-1.5">
                    <label className="text-[11px] sm:text-xs font-bold uppercase tracking-widest text-[#6A8181] ml-1">Full Name</label>
                    <input
                      type="text"
                      name="full_name"
                      value={formData.full_name}
                      onChange={handleChange}
                      className={`w-full bg-white border ${fieldErrors.full_name ? 'border-red-400' : 'border-gray-200'} px-4 py-3 rounded-xl text-sm sm:text-base focus:outline-none focus:border-[#ED7428] transition-colors`}
                    />
                    {fieldErrors.full_name && <p className="text-red-500 text-xs ml-1">{fieldErrors.full_name}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[11px] sm:text-xs font-bold uppercase tracking-widest text-[#6A8181] ml-1">Phone Number</label>
                    <input
                      type="tel"
                      name="phone"
                      value={formData.phone}
                      onChange={handleChange}
                      className={`w-full bg-white border ${fieldErrors.phone ? 'border-red-400' : 'border-gray-200'} px-4 py-3 rounded-xl text-sm sm:text-base focus:outline-none focus:border-[#ED7428] transition-colors`}
                    />
                    {fieldErrors.phone && <p className="text-red-500 text-xs ml-1">{fieldErrors.phone}</p>}
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <label className="text-[11px] sm:text-xs font-bold uppercase tracking-widest text-[#6A8181] ml-1">Email Address</label>
                    <input
                      type="email"
                      name="email"
                      value={formData.email}
                      onChange={handleChange}
                      className={`w-full bg-white border ${fieldErrors.email ? 'border-red-400' : 'border-gray-200'} px-4 py-3 rounded-xl text-sm sm:text-base focus:outline-none focus:border-[#ED7428] transition-colors`}
                    />
                    {fieldErrors.email && <p className="text-red-500 text-xs ml-1">{fieldErrors.email}</p>}
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <label className="text-[11px] sm:text-xs font-bold uppercase tracking-widest text-[#6A8181] ml-1">Your Message</label>
                    <textarea
                      rows={4}
                      name="message"
                      value={formData.message}
                      onChange={handleChange}
                      placeholder="How can we help you today?"
                      className={`w-full bg-white border ${fieldErrors.message ? 'border-red-400' : 'border-gray-200'} px-4 py-3 rounded-xl text-sm sm:text-base focus:outline-none focus:border-[#ED7428] transition-colors resize-none`}
                    />
                    {fieldErrors.message && <p className="text-red-500 text-xs ml-1">{fieldErrors.message}</p>}
                  </div>

                  <div className="sm:col-span-2 pt-2">
                    <CustomSubmitButton status={formStatus} text="Send Message" />
                  </div>
                </form>
              </motion.div>

              {/* Map + Appointment info */}
              <motion.div
                initial={{ opacity: 0, x: 30 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6 }}
                className="space-y-6"
              >
                <a
                  href={siteConfig.contact.address.mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block group relative rounded-2xl sm:rounded-3xl overflow-hidden h-[250px] sm:h-[300px] lg:h-[350px] border-4 border-[#F7F5EF] shadow-md grayscale hover:grayscale-0 transition-all duration-700 cursor-pointer"
                >
                  <iframe
                    src={siteConfig.maps.embedUrl}
                    width="100%"
                    height="100%"
                    style={{ border: 0 }}
                    allowFullScreen
                    loading="lazy"
                    title="Hope Trust Location"
                    className="pointer-events-none"
                  />
                  <div className="absolute inset-0 bg-black/5 group-hover:bg-transparent transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                    <div className="bg-[#00373E] text-white px-6 py-2 rounded-full text-sm sm:text-base font-bold shadow-xl flex items-center gap-2">
                      <MapPin className="w-4 h-4 sm:w-5 sm:h-5" />
                      Get Directions
                    </div>
                  </div>
                </a>

                <div className="bg-[#00373E] p-5 sm:p-8 rounded-2xl sm:rounded-3xl text-white relative overflow-hidden">
                  <div className="relative z-10">
                    <div className="flex items-center gap-3 mb-3">
                      <MessageSquare className="text-[#ED7428] w-5 h-5" />
                      <h3 className="text-xl sm:text-2xl font-bold">By Appointment Only</h3>
                    </div>
                    <p className="text-white/80 text-sm sm:text-base leading-relaxed">
                      All appointments are pre-booked. Please call or message us to schedule your visit. Walk-ins are not available.
                    </p>
                  </div>
                  <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-orange-500/20 rounded-full blur-3xl" />
                </div>
              </motion.div>
            </div>
          </div>
        </section>

      </main>
      <Footer />
    </>
  );
}