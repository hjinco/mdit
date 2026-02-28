import { Accordion } from "@base-ui/react/accordion"
import { cn } from "@mdit/ui/lib/utils"
import { ChevronDown } from "lucide-react"
import { useState } from "react"

interface FAQItem {
	id: string
	question: string
	answer: string
}

const faqItems: FAQItem[] = [
	{
		id: "windows-mobile",
		question: "Is there a Windows or mobile app?",
		answer:
			"Mdit is currently available for macOS only. Windows and mobile apps are on our roadmap and will be released in the future.",
	},
	{
		id: "one-time",
		question: "Is this really a one-time payment?",
		answer:
			"Yes! Once you purchase the lifetime license for $10, you own it forever. No subscriptions, no recurring fees. All future updates are included.",
	},
	{
		id: "multiple-devices",
		question: "Can I use my license on multiple devices?",
		answer:
			"Your license can be activated on up to 3 devices at the same time. Once you've reached the limit, you'll need to deactivate it from one device before activating it on another.",
	},
	{
		id: "refund",
		question: "Do you offer refunds?",
		answer:
			"We offer a 14-day money-back guarantee on all lifetime licenses. If you're not satisfied with the product, reach out to our support team at contact@mdit.app for a full refund.",
	},
	{
		id: "updates",
		question: "Will there be updates after I purchase?",
		answer:
			"Absolutely! All future updates and improvements are included with your lifetime license at no additional cost. You'll receive all new features, bug fixes, and enhancements automatically.",
	},
]

export default function FAQ() {
	const [openValues, setOpenValues] = useState<(string | null)[]>([])

	return (
		<div className="mt-32 mb-24 max-w-2xl mx-auto">
			<div className="text-center mb-12">
				<h2 className="text-3xl font-medium text-foreground/80 mb-3">
					Frequently Asked Questions
				</h2>
				<p className="text-muted-foreground">
					Find answers to common questions about our pricing and license
				</p>
			</div>

			<Accordion.Root
				multiple
				value={openValues}
				onValueChange={(nextValues) => setOpenValues(nextValues)}
				className="space-y-3"
			>
				{faqItems.map((item) => {
					const isOpen = openValues.includes(item.id)

					return (
						<Accordion.Item key={item.id} value={item.id} className="group">
							<Accordion.Header>
								<Accordion.Trigger className="flex w-full items-center justify-between px-6 py-4 font-medium text-foreground hover:text-foreground transition-colors cursor-pointer">
									<span className="text-left text-base font-medium">
										{item.question}
									</span>
									<ChevronDown
										className={cn(
											"h-5 w-5 transition-transform duration-300 flex-shrink-0 ml-2",
											isOpen && "rotate-180",
										)}
										aria-hidden="true"
									/>
								</Accordion.Trigger>
							</Accordion.Header>
							<Accordion.Panel className="overflow-hidden">
								<div className="px-6 py-4 text-muted-foreground text-sm leading-relaxed">
									{item.answer}
								</div>
							</Accordion.Panel>
						</Accordion.Item>
					)
				})}
			</Accordion.Root>
		</div>
	)
}
