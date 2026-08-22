'use client';

import { useState } from 'react';
import { PromptForm } from '@/components/PromptForm';
import { JobStatus } from '@/components/JobStatus';
import { useJobStore } from '@/lib/store';

export default function Home() {
  const { currentJob } = useJobStore();

  return (
    <div className="space-y-8">
      {/* Hero Section */}
      <div className="text-center mb-12">
        <h1 className="text-4xl md:text-5xl font-bold text-slate-900 mb-4">
          AI-Powered App Generation
        </h1>
        <p className="text-lg text-slate-600 max-w-2xl mx-auto">
          Describe your app idea and we'll automatically generate the design, code, and deploy it to a live URL.
        </p>
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Form Section */}
        <div className="lg:col-span-1">
          <PromptForm />
        </div>

        {/* Status Section */}
        <div className="lg:col-span-2">
          {currentJob ? (
            <JobStatus jobId={currentJob.id} />
          ) : (
            <div className="bg-white rounded-lg shadow p-12 text-center">
              <div className="text-6xl mb-4">📝</div>
              <h3 className="text-xl font-semibold text-slate-900 mb-2">
                No Active Generation
              </h3>
              <p className="text-slate-600">
                Fill out the form on the left to start generating your app.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12">
        <div className="bg-blue-50 rounded-lg p-6 border border-blue-100">
          <div className="text-3xl mb-3">⚡</div>
          <h3 className="font-semibold text-slate-900 mb-2">Fast Generation</h3>
          <p className="text-sm text-slate-600">
            Get your design in minutes, full app in hours
          </p>
        </div>

        <div className="bg-purple-50 rounded-lg p-6 border border-purple-100">
          <div className="text-3xl mb-3">🔍</div>
          <h3 className="font-semibold text-slate-900 mb-2">Quality Control</h3>
          <p className="text-sm text-slate-600">
            Security scans, unit tests, and code review before deployment
          </p>
        </div>

        <div className="bg-green-50 rounded-lg p-6 border border-green-100">
          <div className="text-3xl mb-3">🚀</div>
          <h3 className="font-semibold text-slate-900 mb-2">Live & Customizable</h3>
          <p className="text-sm text-slate-600">
            Instantly access your app and make improvements with prompts
          </p>
        </div>
      </div>
    </div>
  );
}
