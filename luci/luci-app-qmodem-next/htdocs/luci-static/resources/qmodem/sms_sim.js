'use strict';
'require baseclass';
'require poll';
'require ui';
'require dom';
'require qmodem.sms as smsService';
'require qmodem.qmodem as qmodem';

// Load CSS
document.head.appendChild(E('link', {
	'rel': 'stylesheet',
	'type': 'text/css',
	// versioned like the view scripts, so a package upgrade never serves stale CSS
	'href': L.resource('qmodem/qmodem-next.css') + (L.env.resource_version ? '?v=' + L.env.resource_version : '')
}));

return baseclass.extend({
	load: function() {
		return qmodem.getModemSections();
	},

	render: function(modems) {
		var self = this;
		var container = E('div', { 'class': 'cbi-map' });

		// Filter enabled modems
		modems = modems.filter(function(m) { return m.enabled; });

		if (modems.length === 0) {
			container.appendChild(E('div', { 'class': 'alert-message warning' }, 
				_('No modems configured or all modems are disabled.')));
			return container;
		}

		// Modem selector
		var selectorSection = E('fieldset', { 'class': 'cbi-section' });
		var selectorTable = E('table', { 'class': 'table' });
		var selectorBody = E('tbody', {});
		var selectorRow = E('tr', { 'class': 'tr' });
		var labelCell = E('td', { 'class': 'td', 'width': '33%' }, _('Modem Name'));
		var selectCell = E('td', { 'class': 'td' });
		
		var select = E('select', {
			'class': 'cbi-input-select',
			'id': 'sms_sim_modem_selector'
		});
		
		modems.forEach(function(modem) {
			select.appendChild(E('option', { 'value': modem.id }, modem.name));
		});
		
		selectCell.appendChild(select);
		selectorRow.appendChild(labelCell);
		selectorRow.appendChild(selectCell);
		selectorBody.appendChild(selectorRow);
		selectorTable.appendChild(selectorBody);
		selectorSection.appendChild(selectorTable);
		container.appendChild(selectorSection);

		// Main content area
		var contentArea = E('div', { 'id': 'sms-sim-content' });
		container.appendChild(contentArea);

		// Loading indicator
		var loadingDiv = E('div', { 'class': 'spinning' }, _('Loading...'));
		contentArea.appendChild(loadingDiv);

		// Load SIM SMS list with selected modem
		var selectedModem = select.value;
		this.loadSimSmsList(contentArea, loadingDiv, selectedModem);

		// Selector change handler
		select.addEventListener('change', function() {
			var loading = E('div', { 'class': 'spinning' }, _('Loading...'));
			dom.content(contentArea, loading);
			self.loadSimSmsList(contentArea, loading, select.value);
		});

		// Start polling for updates
		poll.add(function() {
			self.pollSimSmsList(contentArea, select.value);
		}, 10);

		return container;
	},

	loadSimSmsList: function(contentArea, loadingDiv, configSection) {
		var self = this;

		smsService.getSimSms(configSection).then(function(result) {
			// Remove loading indicator
			if (loadingDiv && loadingDiv.parentNode) {
				dom.content(contentArea, null);
			}

			if (result.error) {
				contentArea.appendChild(E('div', { 'class': 'alert-message error' }, 
					_('Error loading SIM SMS: ') + result.error));
				return;
			}

			// Render SIM SMS list
			self.renderSimSmsList(contentArea, result.messages || [], configSection);
		}).catch(function(err) {
			if (loadingDiv && loadingDiv.parentNode) {
				dom.content(contentArea, null);
			}
			contentArea.appendChild(E('div', { 'class': 'alert-message error' }, 
				_('Failed to load SIM SMS: ') + err.message));
		});
	},

	pollSimSmsList: function(contentArea, configSection) {
		var self = this;
		
		smsService.getSimSms(configSection).then(function(result) {
			if (!result.error && result.messages) {
				self.renderSimSmsList(contentArea, result.messages, configSection);
			}
		}).catch(function(err) {
			console.error('Poll error:', err);
		});
	},

	renderSimSmsList: function(contentArea, messages, configSection) {
		var self = this;
		messages = messages || [];
		dom.content(contentArea, null);
		var activeTab = self.activeListTab === 'sent' ? 'sent' : 'received';
		self.activeListTab = activeTab;
		var container = E('div', { 'class': 'sms-sim-messages' });
		function group(sent) {
			var items = messages.filter(function(message) { return (message.type === 'sent') === sent; });
			var section = E('fieldset', { 'class': 'cbi-section' }, [
				E('legend', {}, (sent ? _('Sent SMS List') : _('Received SMS List')) + ' (' + items.length + ')')
			]);
			if (!items.length) section.appendChild(E('div', { 'class': 'cbi-section-descr' }, _('No messages found')));
			else {
				var rows = [E('tr', { 'class': 'tr cbi-section-table-titles' }, [
					_('Row Number'), sent ? _('Recipient') : _('Sender'), _('Time'), _('Content'), sent ? _('Status') : _('Type'), _('Actions')
				].map(function(label) { return E('th', { 'class': 'th' }, label); }))];
				items.forEach(function(message, index) {
					var contact = message.display_sender || smsService.formatPhoneNumber((sent ? message.recipient : message.sender) || '-');
					var kind = sent ? (message.success === false || message.is_success === false ? _('Failed') : _('Sent')) :
						(message.reference && message.total > 1 ? _('Part') + ' ' + (message.part || '?') + '/' + message.total : _('Single'));
					rows.push(E('tr', { 'class': 'tr cbi-section-table-row' }, [
						E('td', { 'class': 'td' }, String(index + 1)),
						E('td', { 'class': 'td' }, contact),
						E('td', { 'class': 'td' }, message.timestamp ? smsService.formatTimestamp(message.timestamp) : '-'),
						E('td', { 'class': 'td', 'style': 'word-break:break-word;' }, message.content || message.sms_text || ''),
						E('td', { 'class': 'td' }, kind),
						E('td', { 'class': 'td' }, E('button', { 'class': 'cbi-button cbi-button-remove',
							click: function() { self.handleDeleteSimSms(configSection, message.delete_ref, contentArea); }
						}, _('Delete')))
					]));
				});
				section.appendChild(E('table', {
					'class': 'table cbi-section-table',
					'style': 'width:100%;table-layout:fixed;overflow-wrap:anywhere;'
				}, [
					E('colgroup', {}, [8, 27, 18, 25, 10, 12].map(function(width) {
						return E('col', { 'style': 'width:' + width + '%;' });
					})),
					E('tbody', {}, rows)
				]));
				section.appendChild(E('div', { 'class': 'cbi-page-actions' }, E('button', {
					'class': 'cbi-button cbi-button-remove',
					click: function() { self.handleDeleteAllSimSms(configSection, items, contentArea); }
				}, _('Delete All'))));
			}
			return { items: items, section: section };
		}
		var receivedGroup = group(false);
		var sentGroup = group(true);
		var tabs = [
			{ name: 'received', title: _('Received SMS List') + ' (' + receivedGroup.items.length + ')', panel: receivedGroup.section },
			{ name: 'sent', title: _('Sent SMS List') + ' (' + sentGroup.items.length + ')', panel: sentGroup.section }
		];
		var tabMenu = E('ul', { 'class': 'cbi-tabmenu', 'style': 'margin-bottom: 1em;' });
		var tabItems = {};
		function showTab(name) {
			self.activeListTab = name;
			tabs.forEach(function(tab) {
				var isActive = tab.name === name;
				tabItems[tab.name].className = isActive ? 'cbi-tab' : 'cbi-tab-disabled';
				tab.panel.style.display = isActive ? '' : 'none';
			});
		}
		tabs.forEach(function(tab) {
			var li = E('li', {
				'class': tab.name === activeTab ? 'cbi-tab' : 'cbi-tab-disabled',
				'data-tab': tab.name
			}, E('a', {
				'href': '#' + tab.name,
				'click': function(ev) {
					if (ev && ev.preventDefault) ev.preventDefault();
					showTab(tab.name);
				}
			}, tab.title));
			tabItems[tab.name] = li;
			tabMenu.appendChild(li);
			tab.panel.style.display = tab.name === activeTab ? '' : 'none';
		});
		container.appendChild(tabMenu);
		container.appendChild(receivedGroup.section);
		container.appendChild(sentGroup.section);
		container.appendChild(E('div', { 'class': 'cbi-page-actions' }, E('button', {
			'class': 'cbi-button cbi-button-action',
			click: function() {
				var loading = E('div', { 'class': 'spinning' }, _('Loading...'));
				dom.content(contentArea, loading);
				self.loadSimSmsList(contentArea, loading, configSection);
			}
		}, _('Refresh'))));
		contentArea.appendChild(container);
	},

	handleDeleteSimSms: function(configSection, index, contentArea) {
		var self = this;
		
		if (!index || (index.id == null && index.index == null)) {
			ui.addNotification(null, E('p', _('Invalid message index')), 'error');
			return;
		}

		ui.showModal(_('Confirm Delete'), [
			E('p', _('Are you sure you want to delete this message?')),
			E('div', { 'class': 'right' }, [
				E('button', {
					'class': 'cbi-button cbi-button-neutral',
					'click': function() {
						ui.hideModal();
					}
				}, _('Cancel')),
				' ',
				E('button', {
					'class': 'cbi-button cbi-button-negative',
					'click': function() {
						ui.hideModal();
						ui.showModal(_('Deleting...'), E('div', { 'class': 'spinning' }, _('Deleting message...')));
						
						smsService.deleteSimSms(configSection, index).then(function(result) {
							ui.hideModal();
							
							if (result.error) {
								ui.addNotification(null, E('p', _('Failed to delete SMS: ') + result.error), 'error');
								return;
							}
							
							if (result.success) {
								ui.addNotification(null, E('p', _('Message deleted successfully')), 'info');
								// Reload the list
								var loading = E('div', { 'class': 'spinning' }, _('Loading...'));
								dom.content(contentArea, loading);
								self.loadSimSmsList(contentArea, loading, configSection);
							} else {
								ui.addNotification(null, E('p', _('Failed to delete message')), 'error');
							}
						}).catch(function(err) {
							ui.hideModal();
							ui.addNotification(null, E('p', _('Error deleting SMS: ') + err.message), 'error');
						});
					}
				}, _('Delete'))
			])
		]);
	},

	handleDeleteAllSimSms: function(configSection, messages, contentArea) {
		var self = this;
		
		if (!messages || messages.length === 0) {
			ui.addNotification(null, E('p', _('No messages to delete')), 'info');
			return;
		}

		ui.showModal(_('Confirm Delete All'), [
			E('p', _('Are you sure you want to delete ALL %d messages? This action cannot be undone.').format(messages.length)),
			E('div', { 'class': 'right' }, [
				E('button', {
					'class': 'cbi-button cbi-button-neutral',
					'click': function() {
						ui.hideModal();
					}
				}, _('Cancel')),
				' ',
				E('button', {
					'class': 'cbi-button cbi-button-negative',
					'click': function() {
						ui.hideModal();
						ui.showModal(_('Deleting...'), E('div', { 'class': 'spinning' }, 
							_('Deleting all messages... This may take a while.')));
						
						// Delete messages one by one
						var deletePromises = [];
						for (var i = 0; i < messages.length; i++) {
							deletePromises.push(smsService.deleteSimSms(configSection, messages[i].delete_ref));
						}
						
						Promise.all(deletePromises).then(function(results) {
							ui.hideModal();
							
							var successCount = 0;
							var failCount = 0;
							
							for (var i = 0; i < results.length; i++) {
								if (results[i].success) {
									successCount++;
								} else {
									failCount++;
								}
							}
							
							if (failCount === 0) {
								ui.addNotification(null, E('p', _('All %d messages deleted successfully').format(successCount)), 'info');
							} else {
								ui.addNotification(null, E('p', _('%d messages deleted, %d failed').format(successCount, failCount)), 'warning');
							}
							
							// Reload the list
							var loading = E('div', { 'class': 'spinning' }, _('Loading...'));
							dom.content(contentArea, loading);
							self.loadSimSmsList(contentArea, loading, configSection);
						}).catch(function(err) {
							ui.hideModal();
							ui.addNotification(null, E('p', _('Error deleting messages: ') + err.message), 'error');
						});
					}
				}, _('Delete All'))
			])
		]);
	}
});
