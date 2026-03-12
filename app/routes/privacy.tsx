export default function PrivacyPolicy() {
	return (
		<div style={styles.page}>
			<div style={styles.container}>
				<h1 style={styles.title}>Privacy Policy</h1>
				<p style={styles.subtitle}>
					<strong>COD Charge</strong> — operated by Mellow Muffin Apps
				</p>
				<p style={styles.updated}>Last updated: March 9, 2026</p>

				<Section title="1. Introduction">
					<p>
						This Privacy Policy describes how COD Charge (&ldquo;the
						App&rdquo;), developed by Mellow Muffin Apps (&ldquo;we&rdquo;,
						&ldquo;us&rdquo;, or &ldquo;our&rdquo;), collects, uses, and
						discloses information when you install and use the App through the
						Shopify platform.
					</p>
				</Section>

				<Section title="2. Information We Collect">
					<p>
						The App collects and accesses only the minimum information required
						to function:
					</p>
					<ul style={styles.list}>
						<li>
							<strong>Store information:</strong> Your Shopify store domain and
							access tokens required for app authentication, provided
							automatically by Shopify during installation.
						</li>
						<li>
							<strong>Payment method data:</strong> The App reads available
							payment method names at checkout to identify the Cash on Delivery
							option and display the configured charge amount. This data is
							processed in real-time by a Shopify Function and is never stored,
							logged, or transmitted outside of Shopify&rsquo;s infrastructure.
						</li>
					</ul>
					<p style={{ marginTop: 12 }}>
						<strong>We do not collect:</strong>
					</p>
					<ul style={styles.list}>
						<li>Personal information of your customers</li>
						<li>Payment or financial information</li>
						<li>Email addresses, names, or contact details</li>
						<li>Browsing or tracking data</li>
						<li>Cookies or analytics data</li>
					</ul>
				</Section>

				<Section title="3. How We Use Information">
					<p>The information accessed by the App is used solely to:</p>
					<ul style={styles.list}>
						<li>
							Authenticate your store and manage the app installation via
							Shopify&rsquo;s OAuth flow.
						</li>
						<li>
							Display the configured COD charge amount alongside the Cash on
							Delivery payment method at checkout.
						</li>
					</ul>
				</Section>

				<Section title="4. Data Storage and Security">
					<p>
						The App stores only your Shopify store session data (store domain
						and access token) in a secure database, which is required to
						maintain the app installation. The COD charge amount is stored as a
						metafield on the payment customization within Shopify. All checkout
						logic runs entirely within Shopify&rsquo;s infrastructure via
						Shopify Functions — no customer data is sent to or stored on our
						servers.
					</p>
				</Section>

				<Section title="5. Data Sharing and Disclosure">
					<p>
						We do not sell, trade, rent, or otherwise share any data with third
						parties. The App does not use any third-party analytics, tracking,
						or advertising services.
					</p>
				</Section>

				<Section title="6. Data Retention">
					<p>
						Session data is retained only while the App is installed on your
						store. When you uninstall the App, all associated session data is
						automatically deleted.
					</p>
				</Section>

				<Section title="7. Your Rights">
					<p>You have the right to:</p>
					<ul style={styles.list}>
						<li>
							<strong>Access:</strong> Request information about what data we
							store related to your store.
						</li>
						<li>
							<strong>Deletion:</strong> Request deletion of your data at any
							time by uninstalling the App or contacting us.
						</li>
						<li>
							<strong>Portability:</strong> Request a copy of any data we hold
							about your store.
						</li>
					</ul>
				</Section>

				<Section title="8. GDPR and CCPA Compliance">
					<p>
						The App is designed with privacy by default. Since we do not collect
						personal information of end customers, the App complies with the
						General Data Protection Regulation (GDPR) and the California
						Consumer Privacy Act (CCPA). We process the minimum data necessary
						and do not engage in profiling or automated decision-making beyond
						the App&rsquo;s core functionality.
					</p>
				</Section>

				<Section title="9. Changes to This Policy">
					<p>
						We may update this Privacy Policy from time to time. Any changes
						will be posted on this page with an updated &ldquo;Last
						updated&rdquo; date. Continued use of the App after changes
						constitutes acceptance of the revised policy.
					</p>
				</Section>

				<Section title="10. Contact Us">
					<p>
						If you have any questions about this Privacy Policy or our data
						practices, please contact us at:
					</p>
					<p style={{ marginTop: 8 }}>
						<strong>Mellow Muffin Apps</strong>
						<br />
						Email:{' '}
						<a href="mailto:pritesh@mellowmuffin.com" style={styles.link}>
							pritesh@mellowmuffin.com
						</a>
					</p>
				</Section>
			</div>
		</div>
	);
}

function Section({
	title,
	children,
}: {
	title: string;
	children: React.ReactNode;
}) {
	return (
		<div style={styles.section}>
			<h2 style={styles.sectionTitle}>{title}</h2>
			<div style={styles.sectionBody}>{children}</div>
		</div>
	);
}

const styles: Record<string, React.CSSProperties> = {
	page: {
		minHeight: '100vh',
		background: '#f9fafb',
		padding: '48px 20px',
		fontFamily:
			"-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, sans-serif",
	},
	container: {
		maxWidth: 720,
		margin: '0 auto',
		background: 'white',
		borderRadius: 12,
		padding: '48px 48px',
		boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
		border: '1px solid #e5e7eb',
	},
	title: {
		fontSize: 32,
		fontWeight: 700,
		color: '#111827',
		marginBottom: 8,
	},
	subtitle: {
		fontSize: 16,
		color: '#6b7280',
		marginBottom: 4,
	},
	updated: {
		fontSize: 14,
		color: '#9ca3af',
		marginBottom: 36,
	},
	section: {
		marginBottom: 28,
	},
	sectionTitle: {
		fontSize: 18,
		fontWeight: 600,
		color: '#111827',
		marginBottom: 10,
	},
	sectionBody: {
		fontSize: 15,
		color: '#374151',
		lineHeight: 1.7,
	},
	list: {
		paddingLeft: 20,
		marginTop: 8,
		display: 'flex',
		flexDirection: 'column' as const,
		gap: 6,
	},
	link: {
		color: '#2563eb',
		textDecoration: 'none',
	},
};
