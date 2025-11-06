"use client";
import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useInsufficientBalance } from '@/contexts/InsufficientBalanceContext';

export default function InsufficientBalanceModal() {
  const { show429Modal, setShow429Modal } = useInsufficientBalance();

  const handleRechargeClick = async () => {
    try {
      const pricingUrl = process.env.NEXT_PUBLIC_PRICING_URL || 'https://pricing.example.com';
      const url = new URL(pricingUrl);
      
      // Get token from Electron safeStorage
      if (typeof window !== 'undefined' && (window as any).electronAPI?.safeStorage) {
        const token = await (window as any).electronAPI.safeStorage.getItem('token');
        if (token) {
          url.searchParams.set('token', token);
        }
      }
      
      // Add success URL using claudable:// protocol for redirect after payment
      const successUrl = `claudable://`;
      url.searchParams.set('successUrl', successUrl);
      
      const urlString = url.toString();
      const openExternal = (window as any).electronAPI?.shell?.openExternal;
      
      if (openExternal) {
        await openExternal(urlString);
      } else {
        window.open(urlString, '_blank');
      }
    } catch (error) {
      console.error('Failed to open pricing URL:', error);
      const pricingUrl = process.env.NEXT_PUBLIC_PRICING_URL || 'https://pricing.example.com';
      const openExternal = (window as any).electronAPI?.shell?.openExternal;

      if (openExternal) {
        await openExternal(pricingUrl);
      } else {
        window.open(pricingUrl, '_blank');
      }
    }
  };

  return (
    <AnimatePresence>
      {show429Modal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
          >
            <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 p-6 max-w-sm w-full mx-4">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center">
                  <svg className="w-5 h-5 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4v2m0 4v2M9 3H3v6h6V3zm12 0h-6v6h6V3zm-6 12h-6v6h6v-6zm6 0h-6v6h6v-6z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Insufficient Balance</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Please recharge your account</p>
                </div>
              </div>
              
              <p className="text-gray-700 dark:text-gray-300 mb-6 text-sm">
                Your account balance is insufficient to continue. Please recharge your account to keep using our service.
              </p>
              
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setShow429Modal(false)}
                  className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors font-medium text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRechargeClick}
                  className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg transition-colors font-medium text-sm"
                >
                  Recharge Now
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
