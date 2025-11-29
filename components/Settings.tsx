

import React, { useState } from 'react';
import { ApiConfig, AssetAlert } from '../types';
import { Shield, Key, Lock, Save, Bell, Plus, Trash2, RefreshCw, Palette, Cloud, Github } from 'lucide-react';
import { OKXService } from '../services/okxService';

interface SettingsProps {
  config: ApiConfig;
  onSave: (config: ApiConfig) => void;
  t: any;
}

const Settings: React.FC<SettingsProps> = ({ config, onSave, t }) => {
  const [formData, setFormData] = useState<ApiConfig>(config);
  const [showSecrets, setShowSecrets] = useState(false);
  const [newAlertCcy, setNewAlertCcy] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    if (type === 'checkbox') {
        const checked = (e.target as HTMLInputElement).checked;
        setFormData(prev => ({ ...prev, [name]: checked }));
    } else {
        setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleAlertChange = (index: number, field: keyof AssetAlert, value: string | boolean) => {
    const newAlerts = [...(formData.alerts || [])];
    newAlerts[index] = { ...newAlerts[index], [field]: value };
    setFormData(prev => ({ ...prev, alerts: newAlerts }));
  };

  const addAlert = () => {
    if (!newAlertCcy) return;
    const newAlert: AssetAlert = { ccy: newAlertCcy.toUpperCase(), min: '0', max: '1000', enabled: true };
    setFormData(prev => ({ ...prev, alerts: [...(prev.alerts || []), newAlert] }));
    setNewAlertCcy('');
  };

  const removeAlert = (index: number) => {
    const newAlerts = [...(formData.alerts || [])];
    newAlerts.splice(index, 1);
    setFormData(prev => ({ ...prev, alerts: newAlerts }));
  };

  const handleManualSync = async () => {
      if (!formData.githubToken) return;
      setIsSyncing(true);
      setSyncMsg('Syncing...');
      try {
          // Temporary Service just for syncing check
          const tmpService = new OKXService(formData);
          await tmpService.syncHistoryWithGitHub();
          setSyncMsg('Sync Successful! Local data merged with GitHub Gist.');
      } catch (e: any) {
          setSyncMsg(`Sync Failed: ${e.message}`);
      } finally {
          setIsSyncing(false);
      }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8 animate-fadeIn pb-10">
      <div className="bg-surface p-8 rounded-xl border border-border shadow-lg">
        <div className="flex items-center gap-4 mb-6 border-b border-border pb-4">
          <div className="p-3 bg-primary/20 rounded-full text-primary">
            <Shield size={24} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-text">{t.apiConfig}</h2>
            <p className="text-muted text-sm">Manage API keys (Real Trading).</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          
          {/* API Keys */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1 text-muted">API Key</label>
              <div className="relative">
                <Key size={16} className="absolute left-3 top-3.5 text-slate-500" />
                <input
                  type="text"
                  name="apiKey"
                  value={formData.apiKey}
                  onChange={handleChange}
                  className="w-full bg-slate-100 dark:bg-slate-900 border border-border rounded-lg py-3 pl-10 pr-4 focus:ring-1 focus:ring-primary focus:border-primary outline-none transition-all text-text"
                  placeholder="Enter OKX API Key"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1 text-muted">Secret Key</label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-3.5 text-slate-500" />
                <input
                  type={showSecrets ? "text" : "password"}
                  name="secretKey"
                  value={formData.secretKey}
                  onChange={handleChange}
                  className="w-full bg-slate-100 dark:bg-slate-900 border border-border rounded-lg py-3 pl-10 pr-4 focus:ring-1 focus:ring-primary focus:border-primary outline-none transition-all text-text"
                  placeholder="Enter OKX Secret Key"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1 text-muted">Passphrase</label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-3.5 text-slate-500" />
                <input
                  type={showSecrets ? "text" : "password"}
                  name="passphrase"
                  value={formData.passphrase}
                  onChange={handleChange}
                  className="w-full bg-slate-100 dark:bg-slate-900 border border-border rounded-lg py-3 pl-10 pr-4 focus:ring-1 focus:ring-primary focus:border-primary outline-none transition-all text-text"
                  placeholder="Enter API Passphrase"
                />
              </div>
            </div>
            
            <div className="flex items-center gap-2">
                <input 
                    type="checkbox" 
                    id="showSecrets"
                    checked={showSecrets}
                    onChange={(e) => setShowSecrets(e.target.checked)}
                    className="rounded bg-slate-900 border-border text-primary focus:ring-offset-slate-800"
                />
                <label htmlFor="showSecrets" className="text-sm text-muted cursor-pointer">Show secrets</label>
            </div>
          </div>

          <hr className="border-border" />

          {/* GitHub Sync */}
          <div>
            <div className="flex items-center gap-2 mb-4">
                <Cloud className="text-primary" size={20} />
                <h3 className="text-lg font-bold text-text">Cloud Sync (GitHub Gist)</h3>
            </div>
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3 text-xs text-muted mb-4">
                Enter a GitHub Personal Access Token to sync your asset history across devices. 
                Data is stored in a private Gist on your GitHub account.
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium mb-1 text-muted">GitHub Token (Classic)</label>
              <div className="relative">
                <Github size={16} className="absolute left-3 top-3.5 text-slate-500" />
                <input
                  type="password"
                  name="githubToken"
                  value={formData.githubToken || ''}
                  onChange={handleChange}
                  className="w-full bg-slate-100 dark:bg-slate-900 border border-border rounded-lg py-3 pl-10 pr-4 focus:ring-1 focus:ring-primary focus:border-primary outline-none transition-all text-text"
                  placeholder="ghp_xxxxxxxxxxxx"
                />
              </div>
            </div>
            
            {formData.githubToken && (
                <div className="flex items-center gap-4">
                    <button 
                        type="button" 
                        onClick={handleManualSync} 
                        disabled={isSyncing}
                        className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2 disabled:opacity-50"
                    >
                       {isSyncing ? <RefreshCw className="animate-spin" size={14}/> : <RefreshCw size={14}/>} 
                       Sync Now
                    </button>
                    {syncMsg && <span className={`text-xs ${syncMsg.includes('Failed') ? 'text-danger' : 'text-success'}`}>{syncMsg}</span>}
                </div>
            )}
          </div>

          <hr className="border-border" />
          
          {/* App Settings */}
          <div className="space-y-4">
             <div className="flex items-center gap-2 mb-2">
                <RefreshCw className="text-primary" size={20} />
                <h3 className="text-lg font-bold text-text">{t.refreshRate}</h3>
            </div>
            <div className="flex items-center gap-4">
                <input 
                    type="range" 
                    min="1000" 
                    max="60000" 
                    step="1000" 
                    value={formData.refreshInterval || 10000}
                    onChange={(e) => setFormData(prev => ({ ...prev, refreshInterval: parseInt(e.target.value) }))}
                    className="flex-1 h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-primary"
                />
                <span className="w-16 text-right font-mono font-bold text-text">
                    {formData.refreshInterval ? formData.refreshInterval / 1000 : 10}s
                </span>
            </div>

            <div className="flex items-center gap-2 mb-2 mt-6">
                <Palette className="text-primary" size={20} />
                <h3 className="text-lg font-bold text-text">{t.colorMode}</h3>
            </div>
            <div className="flex gap-2">
                <button
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, colorMode: 'standard' }))}
                    className={`flex-1 py-2 px-3 rounded-lg border text-sm font-medium transition-colors ${
                        formData.colorMode === 'standard' || !formData.colorMode
                        ? 'bg-primary/20 border-primary text-primary'
                        : 'bg-slate-100 dark:bg-slate-800 border-border text-muted hover:text-text'
                    }`}
                >
                    {t.modeStandard}
                </button>
                <button
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, colorMode: 'reverse' }))}
                    className={`flex-1 py-2 px-3 rounded-lg border text-sm font-medium transition-colors ${
                        formData.colorMode === 'reverse'
                        ? 'bg-primary/20 border-primary text-primary'
                        : 'bg-slate-100 dark:bg-slate-800 border-border text-muted hover:text-text'
                    }`}
                >
                    {t.modeReverse}
                </button>
            </div>
          </div>

          <hr className="border-border" />

          {/* Asset Alerts Section */}
          <div>
            <div className="flex items-center gap-2 mb-4">
                <Bell className="text-primary" size={20} />
                <h3 className="text-lg font-bold text-text">{t.alertsTitle}</h3>
            </div>
            <p className="text-xs text-muted mb-4">{t.alertsDesc}</p>
            
            <div className="flex gap-2 mb-4">
                <input 
                    type="text" 
                    placeholder="Asset (e.g. BTC)" 
                    value={newAlertCcy}
                    onChange={(e) => setNewAlertCcy(e.target.value)}
                    className="bg-slate-100 dark:bg-slate-900 border border-border rounded-lg px-3 py-2 text-sm w-32 uppercase text-text"
                />
                <button type="button" onClick={addAlert} className="bg-slate-700 hover:bg-slate-600 p-2 rounded-lg text-white">
                    <Plus size={18} />
                </button>
            </div>

            <div className="space-y-3">
                {(formData.alerts || []).map((alert, idx) => (
                    <div key={idx} className="flex items-center gap-2 bg-slate-100 dark:bg-slate-900/50 p-2 rounded-lg border border-border text-sm">
                        <div className="w-16 font-bold uppercase text-text">{alert.ccy}</div>
                        <div className="flex items-center gap-1">
                            <span className="text-xs text-muted">Min</span>
                            <input 
                                type="number" 
                                value={alert.min} 
                                onChange={(e) => handleAlertChange(idx, 'min', e.target.value)}
                                className="w-20 bg-white dark:bg-slate-800 border border-border rounded px-2 py-1 text-text"
                            />
                        </div>
                        <div className="flex items-center gap-1">
                             <span className="text-xs text-muted">Max</span>
                            <input 
                                type="number" 
                                value={alert.max} 
                                onChange={(e) => handleAlertChange(idx, 'max', e.target.value)}
                                className="w-20 bg-white dark:bg-slate-800 border border-border rounded px-2 py-1 text-text"
                            />
                        </div>
                        <div className="flex-1 text-right">
                             <button type="button" onClick={() => removeAlert(idx)} className="text-danger hover:text-red-400">
                                <Trash2 size={16} />
                             </button>
                        </div>
                    </div>
                ))}
            </div>
          </div>

          <button
            type="submit"
            className="w-full bg-primary hover:bg-blue-600 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2 transition-all shadow-lg shadow-blue-500/20"
          >
            <Save size={18} />
            {t.save}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Settings;
