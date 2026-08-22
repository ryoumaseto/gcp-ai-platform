'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { generateApp } from '@/lib/api';
import { useJobStore } from '@/lib/store';

export function PromptForm() {
  const [prompt, setPrompt] = useState('');
  const [appName, setAppName] = useState('');
  const [language, setLanguage] = useState('typescript');
  const [temperature, setTemperature] = useState(0.3);
  const [dbType, setDbType] = useState('postgresql');
  const { addJob, isLoading, setLoading } = useJobStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!prompt.trim() || !appName.trim()) {
      toast.error('Please fill in all required fields');
      return;
    }

    setLoading(true);

    try {
      const response = await generateApp({
        prompt,
        appName,
        language,
        temperature,
        dbType,
      });

      const newJob = {
        id: response.jobId,
        status: 'design_generating' as const,
        prompt,
        appName,
        language,
        temperature,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        progress: 0,
      };

      addJob(newJob);
      toast.success('App generation started! Check the status below.');
      setPrompt('');
      setAppName('');
    } catch (error) {
      console.error('Error:', error);
      toast.error('Failed to start app generation');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-8">
      <h2 className="text-2xl font-bold text-slate-900 mb-2">Create Your App</h2>
      <p className="text-slate-600 mb-6">
        Describe the application you want to build. Our AI will generate the design and code.
      </p>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Prompt */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            App Description *
          </label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g., A task management app with real-time collaboration, tags, and Kanban board..."
            className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            rows={4}
            disabled={isLoading}
            required
          />
          <p className="text-xs text-slate-500 mt-1">
            Be specific about features, design preferences, and functionality.
          </p>
        </div>

        {/* App Name */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            App Name *
          </label>
          <input
            type="text"
            value={appName}
            onChange={(e) => setAppName(e.target.value)}
            placeholder="e.g., TaskFlow Pro"
            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={isLoading}
            required
          />
        </div>

        {/* Configuration Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Language */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Language
            </label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={isLoading}
            >
              <option value="typescript">TypeScript</option>
              <option value="python">Python</option>
              <option value="go">Go</option>
            </select>
          </div>

          {/* Database Type */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Database
            </label>
            <select
              value={dbType}
              onChange={(e) => setDbType(e.target.value)}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={isLoading}
            >
              <option value="postgresql">PostgreSQL</option>
              <option value="mysql">MySQL</option>
              <option value="mongodb">MongoDB</option>
            </select>
          </div>
        </div>

        {/* Temperature Slider */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Creativity Level: {temperature.toFixed(1)}
          </label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={temperature}
            onChange={(e) => setTemperature(parseFloat(e.target.value))}
            className="w-full"
            disabled={isLoading}
          />
          <p className="text-xs text-slate-500 mt-1">
            Lower (0.0) = Deterministic, Higher (1.0) = Creative
          </p>
        </div>

        {/* Submit Button */}
        <div className="flex gap-4">
          <button
            type="submit"
            disabled={isLoading}
            className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400 text-white font-medium py-3 px-4 rounded-lg transition"
          >
            {isLoading ? 'Generating Design...' : 'Generate App Design'}
          </button>
        </div>
      </form>
    </div>
  );
}
